import { getSupabase } from './supabase';
import { compressImage } from './image';

export const VERIFICATION_LABEL = { pending: '等待雙方確認', confirmed: '成交已確認', conflict: '資料不一致' };
export const CUSTOMER_LABEL = { pending: '客戶未回覆', confirmed: '客戶確認已成交', denied: '客戶回覆尚未成交' };
export const PARTNER_REPORT_LABEL = { reported: '車源已回報', not_reported: '車源未回報' };
export const SETTLEMENT_LABEL = { pending: '待結算', settled: '已結算', disputed: '爭議中' };
export const APPROVAL_LABEL = { approved: '已核准', pending: '待 VANTA 確認', rejected: '已拒絕' };
export const CATEGORY_LABEL = { purchase: '收車成本', reconditioning: '整備成本', other: '其他成本' };

export const PARTNER_ACTIONS = [
  ['replied', '已回覆客戶'],
  ['viewing', '已安排看車'],
  ['quoted', '已報價'],
  ['awaiting_partner', '處理中'],
  ['lost', '未成交'],
];

export const DEAL_DOCS = 'deal-docs';

export function nt(n) {
  if (n === null || n === undefined || n === '') return '—';
  return `NT$${Math.round(Number(n)).toLocaleString('en-US')}`;
}

export function toneOf(value) {
  if (['confirmed', 'approved', 'settled'].includes(value)) return 'ok';
  if (['conflict', 'disputed', 'rejected', 'denied'].includes(value)) return 'warn';
  return 'mid';
}

export function confirmMessage(caseNo, subject, url) {
  return [
    '感謝您透過 VANTA MOTORS 找到愛車。',
    '',
    '為完成本次服務紀錄，請協助確認您的購車案件：',
    '',
    `案件編號：${caseNo}`,
    `車輛：${subject || '—'}`,
    '',
    '請點以下連結回覆是否已完成購車：',
    url,
  ].join('\n');
}

// 上傳成本憑證：圖片會先壓縮，PDF 直接上傳
export async function uploadDealDoc(file, partnerId, saleId) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const body = isPdf ? file : await compressImage(file, 2000, 0.85);
  const path = `${partnerId}/${saleId}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`;
  const { error } = await getSupabase()
    .storage.from(DEAL_DOCS)
    .upload(path, body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
  if (error) throw error;
  return path;
}

export async function signedDocUrls(paths) {
  if (!paths || !paths.length) return [];
  const { data, error } = await getSupabase().storage.from(DEAL_DOCS).createSignedUrls(paths, 3600);
  if (error) throw error;
  return data.map((d) => d.signedUrl).filter(Boolean);
}
