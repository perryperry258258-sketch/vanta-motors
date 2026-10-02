import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../../../../lib/supabaseAdmin';
import { verifySignature, reply, getProfile, text } from '../../../../lib/line';

export const dynamic = 'force-dynamic';

const CLOSED = ['won', 'lost', 'cancelled'];
const SELL_WORDS = /賣車|估價|收車|收購|舊換新/;
const FIND_WORDS = /找車|想找|預算/;
// 圖文選單送出的固定文字：沒有進行中案件時不另外建立案件，避免產生大量空案件
const MENU_ONLY = new Set(['找車', '我要賣車', '預約看車', '聯絡我們', '關於 VANTA', '關於VANTA']);
const compact = (id) => String(id || '').replace(/-/g, '').toUpperCase();

export async function POST(req) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const body = JSON.parse(raw || '{}');
  const db = getAdminSupabase();

  for (const event of body.events || []) {
    try {
      await handle(db, event);
    } catch (e) {
      console.error('LINE event failed', e);
    }
  }
  return NextResponse.json({ ok: true });
}

async function handle(db, event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;

  // 同一個事件只處理一次（LINE 可能重送）
  const { error: dup } = await db.from('line_events').insert({
    webhook_event_id: event.webhookEventId || null,
    type: event.type,
    line_user_id: userId,
    payload: event,
  });
  if (dup && dup.code === '23505') return;

  if (event.type === 'postback') return handlePostback(db, event);
  if (event.type === 'follow') {
    await upsertCustomer(db, userId);
    return;
  }
  if (event.type !== 'message') return;

  const msg = event.message || {};
  const body = msg.type === 'text' ? String(msg.text || '').trim() : `［客戶傳送了${typeLabel(msg.type)}，請到 LINE 官方帳號查看］`;

  // 合作車源綁定 LINE
  const bind = body.match(/^VANTA-[A-Z0-9]{6}$/i);
  if (bind) {
    const { data: partner } = await db
      .from('partners')
      .select('id, name')
      .eq('line_bind_code', bind[0].toUpperCase())
      .maybeSingle();
    if (partner) {
      await db.from('partners').update({ line_user_id: userId, line_bind_code: null, updated_at: new Date().toISOString() }).eq('id', partner.id);
      await reply(event.replyToken, [text(`${partner.name} 您好，LINE 綁定完成。之後 VANTA 轉交案件時會直接通知您。`)]);
    } else {
      await reply(event.replyToken, [text('綁定碼不正確或已使用過，請向 VANTA 索取新的綁定碼。')]);
    }
    return;
  }

  // 合作車源傳來的一般訊息不建立客戶案件
  const { data: isPartner } = await db.from('partners').select('id').eq('line_user_id', userId).maybeSingle();
  if (isPartner) return;

  const customer = await upsertCustomer(db, userId);
  if (!customer) return;

  // 1. 網站賣車估價帶來的訊息：對應到已建立的收車案件
  const estRef = body.match(/(?:估價編號|Estimate Ref)\s*[:：]?\s*([0-9A-F]{8})/i);
  if (estRef) {
    const linked = await linkBuyback(db, customer, estRef[1].toUpperCase(), body);
    if (linked) {
      await reply(event.replyToken, [text(`收到您的收車詢問，我們會盡快與您聯繫正式報價。\n\n案件編號：${linked.case_no}`)]);
      return;
    }
  }

  // 2. 網站車輛頁帶來的訊息：建立這台車的案件
  const carRefMatch = body.match(/(?:車輛編號|Ref)\s*[:：]?\s*([0-9A-F]{6})/i);
  if (carRefMatch) {
    const created = await caseForCar(db, customer, carRefMatch[1].toUpperCase(), body);
    if (created) {
      await reply(event.replyToken, [
        text(`收到，我們會確認這台車的最新資訊後回覆您。\n\n為了避免提供過時資料，車況與交易條件會由車輛負責人確認。\n\n案件編號：${created.case_no}`),
      ]);
      return;
    }
  }

  // 3. 一般訊息：加到進行中的案件，沒有就建立新案件
  await appendOrCreate(db, customer, body);
}

function typeLabel(t) {
  return { image: '圖片', video: '影片', audio: '語音', file: '檔案', location: '位置', sticker: '貼圖' }[t] || '訊息';
}

async function upsertCustomer(db, userId) {
  const { data: existing } = await db.from('customers').select('*').eq('line_user_id', userId).maybeSingle();
  if (existing) return existing;
  const profile = await getProfile(userId);
  const { data, error } = await db
    .from('customers')
    .insert({ line_user_id: userId, line_name: profile ? profile.displayName : null, source: 'line' })
    .select('*')
    .single();
  if (error) {
    const { data: again } = await db.from('customers').select('*').eq('line_user_id', userId).maybeSingle();
    return again;
  }
  return data;
}

async function addEvent(db, caseId, type, body) {
  await db.from('case_events').insert({ case_id: caseId, type, body, actor_label: '客戶（LINE）', visibility: 'internal' });
}

async function markUnread(db, caseId) {
  await db.from('cases').update({ unread: true, last_customer_msg_at: new Date().toISOString() }).eq('id', caseId);
}

async function linkBuyback(db, customer, ref, body) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: leads } = await db.from('buyback_leads').select('id, estimate_id').gte('created_at', since).limit(1000);
  const lead = (leads || []).find((l) => compact(l.estimate_id).startsWith(ref));
  if (!lead) return null;
  const { data: c } = await db.from('cases').select('id, case_no, customer_id').eq('buyback_lead_id', lead.id).maybeSingle();
  if (!c) return null;
  if (!c.customer_id) await db.from('cases').update({ customer_id: customer.id, source: 'line' }).eq('id', c.id);
  await addEvent(db, c.id, 'customer_msg', body);
  await markUnread(db, c.id);
  return c;
}

async function caseForCar(db, customer, ref, body) {
  const { data: cars } = await db.from('cars').select('id, title, source_owner_id').limit(3000);
  const car = (cars || []).find((x) => compact(x.id).startsWith(ref));
  if (!car) return null;

  const { data: open } = await db
    .from('cases')
    .select('id, case_no, status')
    .eq('customer_id', customer.id)
    .eq('car_id', car.id)
    .order('created_at', { ascending: false })
    .limit(1);
  let c = open && open[0] && !CLOSED.includes(open[0].status) ? open[0] : null;

  if (!c) {
    const { data } = await db
      .from('cases')
      .insert({
        type: 'buy',
        status: 'new',
        source: 'website',
        customer_id: customer.id,
        car_id: car.id,
        partner_id: car.source_owner_id || null,
        subject: car.title,
        customer_request: body,
      })
      .select('id, case_no')
      .single();
    c = data;
    const { data: inquiry } = await db
      .from('web_inquiries')
      .select('id')
      .eq('car_id', car.id)
      .eq('handled', false)
      .order('created_at', { ascending: false })
      .limit(1);
    if (inquiry && inquiry[0]) {
      await db.from('web_inquiries').update({ handled: true, case_id: c.id }).eq('id', inquiry[0].id);
    }
  }
  await addEvent(db, c.id, 'customer_msg', body);
  await markUnread(db, c.id);
  return c;
}

async function appendOrCreate(db, customer, body) {
  const { data: recent } = await db
    .from('cases')
    .select('id, status')
    .eq('customer_id', customer.id)
    .order('last_activity_at', { ascending: false })
    .limit(5);
  let c = (recent || []).find((x) => !CLOSED.includes(x.status));
  if (!c && MENU_ONLY.has(body)) return;
  if (!c) {
    const type = SELL_WORDS.test(body) ? 'sell' : FIND_WORDS.test(body) ? 'find' : 'buy';
    const { data } = await db
      .from('cases')
      .insert({ type, status: 'new', source: 'line', customer_id: customer.id, customer_request: body })
      .select('id')
      .single();
    c = data;
  }
  await addEvent(db, c.id, 'customer_msg', body);
  await markUnread(db, c.id);
}

async function handlePostback(db, event) {
  const params = new URLSearchParams((event.postback && event.postback.data) || '');
  const token = params.get('confirm');
  const response = params.get('r');
  if (!token || !['confirmed', 'denied'].includes(response)) return;

  const { data: row } = await db
    .from('customer_confirmations')
    .select('id, response, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!row) return;
  if (row.response) {
    await reply(event.replyToken, [text('已收到您先前的回覆，謝謝。')]);
    return;
  }
  if (new Date(row.expires_at) < new Date()) {
    await reply(event.replyToken, [text('這個確認已過期，我們會再與您聯繫。')]);
    return;
  }
  await db
    .from('customer_confirmations')
    .update({ response, responded_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('response', null);
  await reply(event.replyToken, [
    text(response === 'confirmed' ? '已收到您的確認，謝謝您選擇 VANTA MOTORS。' : '已收到，我們會再與您聯繫。'),
  ]);
}
