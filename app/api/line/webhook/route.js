import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../../../../lib/supabaseAdmin';
import { verifySignature, reply, getProfile, text, push } from '../../../../lib/line';
import { chooseSlot, fmtSlot, viewingNotice, addCaseEvent } from '../../../../lib/viewing';
import { HOLD_REPLY, TOPIC_LABEL } from '../../../../lib/questions';

export const dynamic = 'force-dynamic';

const CLOSED = ['won', 'lost', 'cancelled'];
const SELL_WORDS = /賣車|估價|收車|收購|舊換新/;
const FIND_WORDS = /找車|想找|預算/;
// 圖文選單送出的固定文字：沒有進行中案件時不另外建立案件，避免產生大量空案件
const MENU_ONLY = new Set(['找車', '我要賣車', '預約看車', '聯絡我們', '關於 VANTA', '關於VANTA']);
const compact = (id) => String(id || '').replace(/-/g, '').toUpperCase();
// 只認「預約看車」按鈕帶的開頭；詢問訊息裡的「□ 預約看車」選項不算
const VIEWING_WORDS = /我想預約看車|I'd like to book a (viewing|visit)/i;

// 客戶詢問車輛後，用快速回覆按鈕讓客戶選想了解的項目
const ASK_ITEMS = [
  ['condition', '車況'],
  ['price', '價格'],
  ['mileage', '里程'],
  ['viewing', '預約看車'],
  ['other', '其他'],
];
const ASK_QUESTION = {
  condition: '客戶想了解這台車的車況（事故、泡水、維修保養等）',
  price: '客戶想了解這台車的價格與交易條件',
  mileage: '客戶想確認這台車的里程',
};
function askQuickReply(caseId) {
  return {
    items: ASK_ITEMS.map(([k, label]) => ({
      type: 'action',
      action: { type: 'postback', label, data: `ask=${k}&case=${caseId}`, displayText: `想了解：${label}` },
    })),
  };
}

let ORIGIN = '';

export async function POST(req) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const body = JSON.parse(raw || '{}');
  const db = getAdminSupabase();
  ORIGIN = new URL(req.url).origin;

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

  // 0. 網站「我要找車」帶來的訊息：建立找車案件
  const findRefMatch = body.match(/(?:找車編號|Find Ref)\s*[:：]?\s*([0-9A-F]{8})/i);
  if (findRefMatch) {
    const linked = await linkFind(db, customer, findRefMatch[1].toUpperCase(), body);
    if (linked) {
      await reply(event.replyToken, [text(`收到您的找車需求，VANTA 會開始協助尋找合適的車輛，有消息會在這裡通知您。\n\n案件編號：${linked.case_no}`)]);
      return;
    }
  }

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
      // 從「預約看車」按鈕來的訊息：直接當作看車需求
      if (VIEWING_WORDS.test(body)) {
        await viewingRequest(db, created.id);
        await reply(event.replyToken, [
          text(`收到您的看車預約，我會請車輛負責人提供可以看車的時間，確認後在這裡通知您。\n\n案件編號：${created.case_no}`),
        ]);
        return;
      }
      await reply(event.replyToken, [
        {
          ...text(`收到，這台車由 VANTA 協助您確認最新資訊。\n\n為了避免提供過時資料，車況與交易條件會由車輛負責人確認。\n\n案件編號：${created.case_no}\n\n請選擇您想了解的項目：`),
          quickReply: askQuickReply(created.id),
        },
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

async function linkFind(db, customer, ref, body) {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: reqs } = await db
    .from('find_car_requests')
    .select('id, case_id, brand, model, year_from')
    .gte('created_at', since)
    .limit(2000);
  const fr = (reqs || []).find((r) => compact(r.id).startsWith(ref));
  if (!fr) return null;

  let c = null;
  if (fr.case_id) {
    const { data } = await db.from('cases').select('id, case_no, customer_id').eq('id', fr.case_id).maybeSingle();
    c = data;
    if (c && !c.customer_id) await db.from('cases').update({ customer_id: customer.id }).eq('id', c.id);
  }
  if (!c) {
    const { data } = await db
      .from('cases')
      .insert({
        type: 'find',
        status: 'new',
        source: 'website',
        customer_id: customer.id,
        subject: `${fr.year_from ? `${fr.year_from} ` : ''}${fr.brand} ${fr.model}`,
        customer_request: body,
      })
      .select('id, case_no')
      .single();
    c = data;
  }
  await db.from('find_car_requests').update({ case_id: c.id, customer_id: customer.id, updated_at: new Date().toISOString() }).eq('id', fr.id);
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

// 客戶在 LINE 選看車時間：確認按的人就是這個案件的客戶
async function handleSlot(db, event, params) {
  const userId = event.source.userId;
  const slotId = params.get('slot');
  const noneCase = params.get('slot_none');

  if (noneCase) {
    const { data: c } = await db.from('cases').select('id, customer:customers(line_user_id)').eq('id', noneCase).maybeSingle();
    if (!c || !c.customer || c.customer.line_user_id !== userId) return;
    await db.from('viewing_slots').update({ status: 'expired' }).eq('case_id', c.id).eq('status', 'proposed');
    await addCaseEvent(db, c.id, '客戶表示提供的看車時間都不方便，請車源重新提供時間', { visibility: 'partner', actor: '客戶（LINE）' });
    await db.from('cases').update({ unread: true, last_customer_msg_at: new Date().toISOString() }).eq('id', c.id);
    await reply(event.replyToken, [text('收到，我會再請車輛負責人提供其他時間，也歡迎直接告訴我您方便的時段。')]);
    return;
  }

  const { data: slot } = await db
    .from('viewing_slots')
    .select('id, status, slot_at, case:cases(id, case_no, subject, customer:customers(line_user_id))')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot || !slot.case || !slot.case.customer || slot.case.customer.line_user_id !== userId) return;

  if (slot.status === 'chosen') {
    await reply(event.replyToken, [text(`這個時間已經為您預約好了：${fmtSlot(slot.slot_at)}`)]);
    return;
  }
  if (slot.status !== 'proposed') {
    await reply(event.replyToken, [text('這個時間已經失效，我會再幫您確認新的看車時間。')]);
    return;
  }
  const r = await chooseSlot(db, slot.id, { via: 'line', actor: '客戶（LINE）' });
  if (!r) {
    await reply(event.replyToken, [text('這個時間剛剛已經更新，我會再幫您確認。')]);
    return;
  }
  const notice = await viewingNotice(db);
  await reply(event.replyToken, [
    text(`已為您預約看車 ✅\n\n時間：${r.when}\n車輛：${slot.case.subject || '未指定車輛（請洽 VANTA 客服）'}\n案件編號：${slot.case.case_no}\n\n${notice}`),
  ]);
}

// 看車需求：記錄在案件，已接案的車源用 LINE 通知提供時間
async function viewingRequest(db, caseId) {
  const { data: c } = await db
    .from('cases')
    .select('id, case_no, subject, partner_id, partner_response, partner:partners(line_user_id)')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return;
  await addCaseEvent(db, c.id, '客戶想預約看車，請車源提供 1～3 個看車時間', { visibility: 'partner', actor: '客戶（LINE）' });
  await db.from('cases').update({ unread: true, last_customer_msg_at: new Date().toISOString() }).eq('id', c.id);
  if (c.partner_id && c.partner_response === 'accepted' && c.partner && c.partner.line_user_id) {
    try {
      await push(c.partner.line_user_id, [
        text(`VANTA 看車需求\n\n案件編號：${c.case_no}\n車輛：${c.subject || '未指定車輛'}\n\n客戶想預約看車，請提供 1～3 個方便的時間：\n${ORIGIN}/partner/cases/${c.id}`),
      ]);
    } catch (e) {
      console.error('notify partner failed', e);
    }
  }
}

// 客戶按快速回覆：車況／價格／里程 → 請車源確認；預約看車 → 看車需求；其他 → 請客戶輸入
async function handleAsk(db, event, params) {
  const userId = event.source.userId;
  const kind = params.get('ask');
  const { data: c } = await db
    .from('cases')
    .select('id, case_no, subject, status, partner_id, partner:partners(line_user_id), customer:customers(line_user_id)')
    .eq('id', params.get('case'))
    .maybeSingle();
  if (!c || !c.customer || c.customer.line_user_id !== userId) return;
  if (CLOSED.includes(c.status)) {
    await reply(event.replyToken, [text('這個案件已經結束，如需協助請直接告訴我。')]);
    return;
  }

  if (kind === 'viewing') {
    await viewingRequest(db, c.id);
    await reply(event.replyToken, [text('收到，我會請車輛負責人提供可以看車的時間，確認後在這裡通知您。')]);
    return;
  }
  if (kind === 'other' || !ASK_QUESTION[kind]) {
    await db.from('cases').update({ unread: true, last_customer_msg_at: new Date().toISOString() }).eq('id', c.id);
    await reply(event.replyToken, [text('好的，請直接輸入您想了解的內容，我幫您確認。')]);
    return;
  }

  // 車況、價格、里程：VANTA 不自行回答，建立車況確認給車源
  if (c.partner_id) {
    const { data: open } = await db
      .from('partner_questions')
      .select('id')
      .eq('case_id', c.id)
      .eq('topic', kind)
      .eq('status', 'open')
      .limit(1);
    if (!open || !open.length) {
      await db.from('partner_questions').insert({
        case_id: c.id,
        partner_id: c.partner_id,
        topic: kind,
        question: ASK_QUESTION[kind],
        created_by_label: '客戶（LINE）',
      });
      await addCaseEvent(db, c.id, `請車源確認（${TOPIC_LABEL[kind]}）：${ASK_QUESTION[kind]}`, { visibility: 'partner', actor: '客戶（LINE）' });
      if (c.partner && c.partner.line_user_id) {
        try {
          await push(c.partner.line_user_id, [
            text(`VANTA 車況確認\n\n案件編號：${c.case_no}\n車輛：${c.subject || '未指定車輛'}\n項目：${TOPIC_LABEL[kind]}\n客戶問題：${ASK_QUESTION[kind]}\n\n請到合作夥伴頁面回覆：\n${ORIGIN}/partner/cases/${c.id}`),
          ]);
        } catch (e) {
          console.error('notify partner failed', e);
        }
      }
    }
  } else {
    await addCaseEvent(db, c.id, `客戶想了解：${TOPIC_LABEL[kind]}（尚未指定車源，請先指派）`, { actor: '客戶（LINE）' });
  }
  await db.from('cases').update({ unread: true, last_customer_msg_at: new Date().toISOString() }).eq('id', c.id);
  await reply(event.replyToken, [text(HOLD_REPLY)]);
}

async function handlePostback(db, event) {
  const params = new URLSearchParams((event.postback && event.postback.data) || '');
  if (params.get('slot') || params.get('slot_none')) return handleSlot(db, event, params);
  if (params.get('ask')) return handleAsk(db, event, params);
  const token = params.get('confirm');
  const response = params.get('r');
  if (!token || !['confirmed', 'denied'].includes(response)) return;

  const { data: row } = await db
    .from('customer_confirmations')
    .select('id, case_id, response, expires_at')
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
  // 客戶回覆「尚未成交」而車源已回報成交 → 資料不一致，提醒管理員，不進入分潤
  if (response === 'denied') {
    await addCaseEvent(db, row.case_id, '⚠️ 客戶回覆「尚未成交」。若車源已回報成交，雙方資料不一致，請管理員確認，暫不進入分潤。', { actor: '客戶（LINE）' });
    await db.from('cases').update({ unread: true, last_customer_msg_at: new Date().toISOString() }).eq('id', row.case_id);
  } else {
    await addCaseEvent(db, row.case_id, '客戶在 LINE 確認已完成購車', { visibility: 'partner', actor: '客戶（LINE）' });
  }
  await reply(event.replyToken, [
    text(response === 'confirmed' ? '已收到您的確認，謝謝您選擇 VANTA MOTORS。' : '已收到，我們會再與您聯繫。'),
  ]);
}
