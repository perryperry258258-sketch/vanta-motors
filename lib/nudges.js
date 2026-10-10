// 每天早上排程：看車後隔天關心客戶、提醒業務接案與給看車時間（伺服器端）
import { push, text } from './line';
import { addCaseEvent, fmtSlot } from './viewing';

const TZ = 'Asia/Taipei';
const CLOSED = ['won', 'lost', 'cancelled'];
const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const carName = (c) => (c && c.subject) || '您看的車';

// 昨天看車的案件：關心客戶看完的想法；業務還沒回報結果的，提醒回報
export async function sendViewingFollowups(db, origin) {
  const yesterday = day(new Date(Date.now() - 864e5));
  const from = new Date(`${yesterday}T00:00:00+08:00`).toISOString();
  const to = new Date(`${yesterday}T23:59:59+08:00`).toISOString();
  const { data: list } = await db
    .from('cases')
    .select('id, case_no, subject, status, viewing_at, viewing_reported_at, customer:customers(line_user_id), partner:partners(line_user_id)')
    .is('viewing_followed_at', null)
    .gte('viewing_at', from)
    .lte('viewing_at', to);
  let sent = 0;
  for (const c of list || []) {
    if (CLOSED.includes(c.status)) continue;
    try {
      if (c.customer && c.customer.line_user_id) {
        await push(c.customer.line_user_id, [
          text(`您好，昨天看的${carName(c)}還順利嗎？😊\n\n看完覺得如何？如果還有想再確認的地方，例如車況、保養紀錄或交易條件，直接在這裡告訴我們，我們幫您問清楚。\n\n案件編號：${c.case_no}`),
        ]);
      }
      const reported = c.viewing_reported_at && new Date(c.viewing_reported_at) >= new Date(c.viewing_at);
      if (!reported && c.partner && c.partner.line_user_id) {
        await push(c.partner.line_user_id, [
          text(`VANTA 看車結果回報提醒\n\n案件編號：${c.case_no}\n車輛：${c.subject || '未指定車輛'}\n看車時間：${fmtSlot(c.viewing_at)}\n\n請回報這次看車的結果（客戶反應、是否報價），方便後續跟進：\n${origin}/partner/cases/${c.id}`),
        ]);
      }
      await db.from('cases').update({ viewing_followed_at: new Date().toISOString() }).eq('id', c.id);
      await addCaseEvent(db, c.id, '看車隔天：已用 LINE 關心客戶看車感想' + (reported ? '' : '，並提醒車源回報看車結果'));
      sent += 1;
    } catch (e) {
      console.error('viewing followup failed', c.id, e);
    }
  }
  return sent;
}

// 業務逾時：指派超過 24 小時還沒接案、接案超過 2 天還沒給看車時間 → 用 LINE 提醒業務，並列入管理員每日提醒
export async function sendPartnerNudges(db, origin) {
  const now = Date.now();
  const { data: open } = await db
    .from('cases')
    .select('id, case_no, subject, type, status, partner_id, partner_response, partner_assigned_at, partner_responded_at, viewing_at, partner:partners(name, line_user_id)')
    .not('partner_id', 'is', null)
    .not('status', 'in', `(${CLOSED.join(',')})`)
    .neq('type', 'sell')
    .limit(1000);
  const { data: proposed } = await db.from('viewing_slots').select('case_id').eq('status', 'proposed').limit(2000);
  const hasSlots = new Set((proposed || []).map((s) => s.case_id));

  const pending = [];
  const noSlots = [];
  for (const c of open || []) {
    if (c.partner_response === 'pending' && c.partner_assigned_at && now - new Date(c.partner_assigned_at).getTime() > 24 * 3600e3) pending.push(c);
    else if (c.partner_response === 'accepted' && !c.viewing_at && !hasSlots.has(c.id) && c.partner_responded_at && now - new Date(c.partner_responded_at).getTime() > 48 * 3600e3) noSlots.push(c);
  }

  for (const c of pending) {
    if (!c.partner || !c.partner.line_user_id) continue;
    try {
      await push(c.partner.line_user_id, [
        text(`VANTA 案件提醒\n\n案件編號：${c.case_no}\n車輛：${c.subject || '未指定車輛'}\n\n這個案件指派給您已超過 24 小時，還沒有接案。請確認是否可以接，無法配合也請按「無法配合」，VANTA 會改派：\n${origin}/partner/cases/${c.id}`),
      ]);
    } catch (e) {
      console.error('nudge failed', c.id, e);
    }
  }
  for (const c of noSlots) {
    if (!c.partner || !c.partner.line_user_id) continue;
    try {
      await push(c.partner.line_user_id, [
        text(`VANTA 案件提醒\n\n案件編號：${c.case_no}\n車輛：${c.subject || '未指定車輛'}\n\n接案已超過 2 天，還沒有提供看車時間。客戶還在等，請提供 1～3 個方便的時間：\n${origin}/partner/cases/${c.id}`),
      ]);
    } catch (e) {
      console.error('nudge failed', c.id, e);
    }
  }
  return {
    pending: pending.map((c) => ({ case_no: c.case_no, subject: c.subject, partner: c.partner && c.partner.name })),
    noSlots: noSlots.map((c) => ({ case_no: c.case_no, subject: c.subject, partner: c.partner && c.partner.name })),
  };
}
