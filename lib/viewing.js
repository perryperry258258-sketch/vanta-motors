// 看車預約：伺服器端共用（API 與 LINE webhook）
import { push, text } from './line';

export const TZ = 'Asia/Taipei';
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
// 案件沒有填車輛名稱時的顯示文字
const carName = (c) => (c && c.subject) || '未指定車輛（請洽 VANTA 客服）';

// 例如「10/4（六）14:00」，一律以台灣時間顯示
export function fmtSlot(value) {
  const d = new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  const wd = WEEK[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)];
  return `${parts.month}/${parts.day}（${wd}）${parts.hour}:${parts.minute}`;
}

// 驗證車源提供的時間：1～3 個、30 分鐘後到 60 天內、不重複
export function validateSlots(list, now = Date.now()) {
  const values = [...new Set((list || []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (values.length < 1 || values.length > 3) return { error: '請提供 1～3 個看車時間' };
  const dates = values.map((v) => new Date(v));
  if (dates.some((d) => Number.isNaN(d.getTime()))) return { error: '時間格式不正確' };
  if (dates.some((d) => d.getTime() < now + 30 * 60 * 1000)) return { error: '看車時間至少要在 30 分鐘之後' };
  if (dates.some((d) => d.getTime() > now + 60 * 864e5)) return { error: '看車時間請在 60 天內' };
  return { slots: dates.sort((a, b) => a - b).map((d) => d.toISOString()) };
}

export function slotMessages(c, slots) {
  const lines = slots.map((s) => `・${fmtSlot(s.slot_at)}`).join('\n');
  const place = slots[0] && slots[0].location;
  return [
    text(`好的，我幫您確認好了。\n\n車輛負責人目前提供以下看車時間：\n${lines}\n${place ? `\n看車地點：${place}\n` : ''}\n請選擇您方便的時間。`),
    {
      type: 'template',
      altText: `請選擇看車時間（${c.case_no}）`,
      template: {
        type: 'buttons',
        text: `案件編號 ${c.case_no}\n${carName(c)}`.slice(0, 160),
        actions: [
          ...slots.map((s) => ({
            type: 'postback',
            label: fmtSlot(s.slot_at).slice(0, 20),
            data: `slot=${s.id}`,
            displayText: `我選 ${fmtSlot(s.slot_at)}`,
          })),
          { type: 'postback', label: '這些時間都不方便', data: `slot_none=${c.id}`, displayText: '這些時間都不方便' },
        ],
      },
    },
  ];
}

export async function addCaseEvent(db, caseId, body, { visibility = 'internal', actor = '系統', type = 'note' } = {}) {
  await db.from('case_events').insert({ case_id: caseId, type, body, visibility, actor_label: actor });
}

// 把目前「待客戶確認」的時間用 LINE 傳給客戶；客戶沒有連結 LINE 就提醒人工聯絡
export async function sendSlotsToCustomer(db, caseId, actor) {
  const { data: c } = await db
    .from('cases')
    .select('id, case_no, subject, customer:customers(line_user_id)')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { sent: false, reason: 'case not found' };
  const { data: slots } = await db.from('viewing_slots').select('*').eq('case_id', caseId).eq('status', 'proposed').order('slot_at');
  if (!slots || !slots.length) return { sent: false, reason: '沒有待確認的看車時間' };

  const lineId = c.customer && c.customer.line_user_id;
  if (!lineId) {
    await addCaseEvent(db, caseId, '客戶沒有連結 LINE 官方帳號，請人工聯絡客戶確認看車時間', { actor });
    await db.from('cases').update({ unread: true }).eq('id', caseId);
    return { sent: false, reason: '客戶沒有連結 LINE，請人工聯絡客戶' };
  }
  await push(lineId, slotMessages(c, slots));
  await db.from('viewing_slots').update({ sent_to_customer_at: new Date().toISOString() }).in('id', slots.map((s) => s.id));
  await addCaseEvent(db, caseId, `已用 LINE 傳送看車時間給客戶：${slots.map((s) => fmtSlot(s.slot_at)).join('、')}`, { actor });
  return { sent: true };
}

// 客戶選定時間：預約成立、其他時間失效、通知車源
export async function chooseSlot(db, slotId, { via, actor }) {
  const now = new Date().toISOString();
  const { data: picked } = await db
    .from('viewing_slots')
    .update({ status: 'chosen', chosen_at: now, chosen_via: via })
    .eq('id', slotId)
    .eq('status', 'proposed')
    .select('*')
    .maybeSingle();
  if (!picked) return null;

  await db.from('viewing_slots').update({ status: 'expired' }).eq('case_id', picked.case_id).eq('status', 'proposed');
  const { data: c } = await db
    .from('cases')
    .update({ viewing_at: picked.slot_at, viewing_location: picked.location || null, viewing_reminded_at: null, status: 'viewing' })
    .eq('id', picked.case_id)
    .select('id, case_no, subject, partner:partners(name, line_user_id)')
    .single();

  const when = fmtSlot(picked.slot_at);
  await addCaseEvent(db, c.id, `已預約看車：${when}${picked.location ? `，地點：${picked.location}` : ''}（${via === 'line' ? '客戶在 LINE 選擇' : '客服代客戶確認'}）`, { visibility: 'partner', actor });
  if (c.partner && c.partner.line_user_id) {
    try {
      await push(c.partner.line_user_id, [
        text(`VANTA 看車預約確認\n\n案件編號：${c.case_no}\n車輛：${carName(c)}\n時間：${when}${picked.location ? `\n地點：${picked.location}` : ''}\n\n客戶已確認時間，到場時會告知 VANTA 案件編號。請準時接待，如需更改請到合作夥伴頁面回報。`),
      ]);
    } catch (e) {
      console.error('notify partner failed', e);
    }
  }
  return { case: c, when, location: picked.location || null };
}

// 預約完成後給客戶的完整說明：時間、地點、車輛提供者、到場方式、聯絡方式
export async function bookedMessage(db, caseId) {
  const { data: c } = await db
    .from('cases')
    .select('id, case_no, subject, viewing_at, viewing_location, partner:partners(dealer:dealers(name))')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return null;
  const notice = await viewingNotice(db);
  const dealer = c.partner && c.partner.dealer && c.partner.dealer.name;
  const place = c.viewing_location;
  return [
    '您的看車預約已完成 ✅',
    '',
    `時間：${fmtSlot(c.viewing_at)}`,
    `車輛：${carName(c)}`,
    dealer ? `車輛提供者：${dealer}` : null,
    place ? `看車地點：${place}` : null,
    `案件編號：${c.case_no}`,
    '',
    `到場時請告知現場人員「VANTA 案件編號 ${c.case_no}」。`,
    '如需改期、找不到地點或臨時有事，請直接在這個 LINE 告訴我們，我們會立即聯絡現場人員。',
    '',
    notice,
  ].filter((x) => x !== null).join('\n');
}

// 看車前一天提醒客戶與車源（每天早上排程執行）
export async function sendViewingReminders(db, origin) {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const tomorrow = day(new Date(Date.now() + 864e5));
  const from = new Date(`${tomorrow}T00:00:00+08:00`).toISOString();
  const to = new Date(`${tomorrow}T23:59:59+08:00`).toISOString();
  const { data: list } = await db
    .from('cases')
    .select('id, case_no, subject, viewing_at, viewing_location, customer:customers(line_user_id), partner:partners(line_user_id, dealer:dealers(name))')
    .eq('status', 'viewing')
    .is('viewing_reminded_at', null)
    .gte('viewing_at', from)
    .lte('viewing_at', to);
  let sent = 0;
  for (const c of list || []) {
    const when = fmtSlot(c.viewing_at);
    const place = c.viewing_location;
    const dealer = c.partner && c.partner.dealer && c.partner.dealer.name;
    try {
      if (c.customer && c.customer.line_user_id) {
        await push(c.customer.line_user_id, [
          text([
            '提醒您，明天有預約看車 🚗',
            '',
            `時間：${when}`,
            `車輛：${carName(c)}`,
            dealer ? `車輛提供者：${dealer}` : null,
            place ? `看車地點：${place}` : null,
            '',
            `到場時請告知「VANTA 案件編號 ${c.case_no}」。如需改期，請直接在這個 LINE 告訴我們。`,
          ].filter((x) => x !== null).join('\n')),
        ]);
      }
      if (c.partner && c.partner.line_user_id) {
        await push(c.partner.line_user_id, [
          text(`VANTA 明日看車提醒\n\n案件編號：${c.case_no}\n車輛：${carName(c)}\n時間：${when}${place ? `\n地點：${place}` : ''}\n\n請確認車輛已備妥。如需更改：\n${origin}/partner/cases/${c.id}`),
        ]);
      }
      await db.from('cases').update({ viewing_reminded_at: new Date().toISOString() }).eq('id', c.id);
      await addCaseEvent(db, c.id, '已用 LINE 傳送明日看車提醒給客戶與車源', { visibility: 'partner' });
      sent += 1;
    } catch (e) {
      console.error('viewing reminder failed', c.id, e);
    }
  }
  return sent;
}

export const DEFAULT_NOTICE =
  '這台車為 VANTA MOTORS 合作車源。VANTA 將協助您安排看車、媒合及交易前資訊確認。實際車況、最終價格、交易條件及交車相關事項，將由實際車輛提供者與您確認。建議看車時親自確認車況及相關紀錄，確認符合需求後，再決定是否進一步交易。';

export async function viewingNotice(db) {
  const { data } = await db.from('crm_settings').select('viewing_notice').eq('id', 1).maybeSingle();
  return (data && data.viewing_notice) || DEFAULT_NOTICE;
}
