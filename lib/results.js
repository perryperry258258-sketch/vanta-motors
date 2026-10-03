// 看車結果與客戶跟進：前後台共用
export const RESULTS = [
  ['undecided', '尚未決定'],
  ['interested', '有興趣'],
  ['considering', '考慮中'],
  ['quoted', '已報價'],
  ['sold', '已成交'],
  ['no_interest', '沒有興趣'],
];
export const RESULT_LABEL = Object.fromEntries(RESULTS);

// 這些結果代表還要繼續跟進客戶
export const FOLLOW_RESULTS = ['undecided', 'interested', 'considering', 'quoted'];

export function followUpMessage(name, subject) {
  return [
    `${name ? `${name}您好` : '您好'}，上次看的 ${subject || '車輛'}，不知道您考慮得如何？`,
    '',
    '如果還有任何車況、價格或其他問題，都可以直接跟我說，我幫您確認。',
  ].join('\n');
}

export const toInt = (v) => {
  const n = Math.round(Number(String(v ?? '').replace(/[,\s]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
};
