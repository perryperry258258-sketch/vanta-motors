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
  return [
    text(`好的，我幫您確認好了。\n\n車輛負責人目前提供以下看車時間：\n${lines}\n\n請選擇您方便的時間。`),
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
    .update({ viewing_at: picked.slot_at, status: 'viewing' })
    .eq('id', picked.case_id)
    .select('id, case_no, subject, partner:partners(name, line_user_id)')
    .single();

  const when = fmtSlot(picked.slot_at);
  await addCaseEvent(db, c.id, `已預約看車：${when}（${via === 'line' ? '客戶在 LINE 選擇' : '客服代客戶確認'}）`, { visibility: 'partner', actor });
  if (c.partner && c.partner.line_user_id) {
    try {
      await push(c.partner.line_user_id, [
        text(`VANTA 看車預約確認\n\n案件編號：${c.case_no}\n車輛：${carName(c)}\n時間：${when}\n\n客戶已確認時間，請準時接待。如需更改，請到合作夥伴頁面回報。`),
      ]);
    } catch (e) {
      console.error('notify partner failed', e);
    }
  }
  return { case: c, when };
}

export const DEFAULT_NOTICE =
  '這台車為 VANTA MOTORS 合作車源。VANTA 將協助您安排看車、媒合及交易前資訊確認。實際車況、最終價格、交易條件及交車相關事項，將由實際車輛提供者與您確認。建議看車時親自確認車況及相關紀錄，確認符合需求後，再決定是否進一步交易。';

export async function viewingNotice(db) {
  const { data } = await db.from('crm_settings').select('viewing_notice').eq('id', 1).maybeSingle();
  return (data && data.viewing_notice) || DEFAULT_NOTICE;
}
