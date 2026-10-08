// 車況確認（客戶問題 → 車源回覆 → VANTA 回覆客戶）：前後台共用
export const TOPICS = [
  ['accident', '事故'],
  ['flood', '泡水'],
  ['bodywork', '鈑金烤漆'],
  ['repair', '維修'],
  ['maintenance', '保養'],
  ['mileage', '里程'],
  ['price', '價格'],
  ['loan', '貸款'],
  ['warranty', '保固'],
  ['condition', '車況'],
  ['source', '車輛來源'],
  ['other', '其他'],
];
export const TOPIC_LABEL = Object.fromEntries(TOPICS);

export const Q_STATUS = { open: '等待車源回覆', answered: '車源已回覆，待回覆客戶', sent: '已回覆客戶', cancelled: '已取消' };

// 客戶訊息裡出現這些字，後台會提示「需要請車源確認」
export const CONDITION_WORDS = /事故|泡水|淹水|鈑金|烤漆|維修|保養|里程|公里|價格|多少錢|議價|貸款|分期|保固|車況|來源|原廠|一手|過戶|交車/;

// 客服訊息不可出現的保證性字眼
export const GUARANTEE_RE = /保證|絕對沒|絕對不|百分之百|100%|一定沒|一定不會|包準/;

export const HOLD_REPLY =
  '收到，我幫您確認這台車最新的資訊 👍\n\n因為車況、里程、保養及交易條件可能會隨時間更新，我會先向實際車輛負責人確認，再回覆您，避免提供過時資訊。';

export const DEFAULT_DISCLAIMER =
  '以上資訊為實際車輛提供者目前提供的資料，VANTA 協助您進行確認與轉達。因車況涉及實際車輛狀態，建議您看車時親自確認，必要時搭配保養、維修或車況相關紀錄；最終仍以實車檢視及正式交易文件為準。';

const pad = (n) => String(n).padStart(2, '0');
export function fmtTime(value) {
  const d = new Date(new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 回覆客戶的預設內容：附上來源與確認時間，以及責任說明
export function buildCustomerReply(q, disclaimer = DEFAULT_DISCLAIMER) {
  return [
    `您好，關於您詢問的「${q.question}」，車輛負責人回覆如下：`,
    '',
    q.answer,
    '',
    `（${fmtTime(q.answered_at)} 由車輛負責人提供）`,
    '',
    disclaimer,
  ].join('\n');
}
