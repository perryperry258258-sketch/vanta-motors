export const CASE_STATUS = [
  ['new', '新詢問'],
  ['in_progress', '客服處理中'],
  ['transferred', '已轉交車源'],
  ['awaiting_partner', '等待車源回覆'],
  ['replied', '已回覆客戶'],
  ['viewing', '已安排看車'],
  ['quoted', '已報價'],
  ['won', '成交'],
  ['lost', '未成交'],
  ['cancelled', '取消'],
];
export const STATUS_LABEL = Object.fromEntries(CASE_STATUS);
export const CLOSED = ['won', 'lost', 'cancelled'];

export const CASE_TYPES = [['buy', '買車'], ['sell', '賣車／收車'], ['find', '找車'], ['other', '其他']];
export const TYPE_LABEL = Object.fromEntries(CASE_TYPES);

export const SOURCES = [['line', 'LINE'], ['website', '網站'], ['instagram', 'Instagram'], ['referral', '介紹'], ['other', '其他']];
export const SOURCE_LABEL = Object.fromEntries(SOURCES);

// 超過這個時數沒有任何進度的進行中案件，會被標示提醒
export const STALE_HOURS = 48;

export function isStale(c) {
  return !CLOSED.includes(c.status) && Date.now() - new Date(c.last_activity_at).getTime() > STALE_HOURS * 3600 * 1000;
}

export function statusTone(status) {
  if (status === 'won') return 'ok';
  if (status === 'lost' || status === 'cancelled') return 'off';
  if (status === 'new') return 'new';
  return 'mid';
}

// 車輛短編號，方便在 LINE 對話中辨識是哪一台
export function carRef(id) {
  return String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function shortDate(value) {
  const d = new Date(value);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 轉交給車源的訊息：只給案件與需求，客戶聯絡方式由 VANTA 統一處理，不提供給車源
export function buildTransferMessage(c, origin = '') {
  return [
    'VANTA 新案件',
    '',
    `案件編號：${c.case_no}`,
    `車輛：${c.subject || (c.car && c.car.title) || '未指定'}`,
    '案件來源：VANTA MOTORS',
    '',
    `客戶需求：${c.customer_request || '待補充'}`,
    '',
    '請到合作夥伴頁面接受案件並提供看車時間：',
    `${origin}/partner/cases/${c.id}`,
  ].join('\n');
}

export const PARTNER_RESPONSE_LABEL = { pending: '車源待接案', accepted: '車源已接案', declined: '車源無法配合' };
