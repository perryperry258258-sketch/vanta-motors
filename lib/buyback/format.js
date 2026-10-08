import { site } from '../site';
import { conditionLabel } from './conditions';

export function formatNT(n) {
  return Number(n).toLocaleString('en-US');
}

export function formatKm(n) {
  return `${Number(n).toLocaleString('en-US')} km`;
}

function toWan(n) {
  return `${+(Number(n) / 10000).toFixed(1)}`;
}

function toK(n) {
  return `${Math.round(Number(n) / 1000)}K`;
}

export function formatDate(lang, value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (lang === 'en') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[m - 1]} ${d}, ${y}`;
  }
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

export function buildLineMessage(lang, r, photoCount = 0, cond = {}) {
  const car = `${r.year} ${r.brand} ${r.model}`;
  const en = lang === 'en';
  const c = (k, name) => (cond[k] ? `${name}${en ? ': ' : '：'}${conditionLabel(k, cond[k], lang)}` : null);
  const condLines = [
    c('accident', en ? 'Accident history' : '事故紀錄'),
    c('flood', en ? 'Flood damage' : '泡水紀錄'),
    c('maintenance', en ? 'Service history' : '保養紀錄'),
    cond.region ? `${en ? 'Location' : '所在地區'}${en ? ': ' : '：'}${cond.region}` : null,
    cond.note && cond.note.trim() ? `${en ? 'Notes' : '其他說明'}${en ? ': ' : '：'}${cond.note.trim().slice(0, 300)}` : null,
  ];
  const hasRange = r.low && r.high;
  const ref = String(r.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  if (lang === 'en') {
    return [
      "Hello, I'd like a quote for selling my car:",
      '',
      `Vehicle: ${car}`,
      `Mileage: ${formatKm(r.mileage)}`,
      ...condLines,
      hasRange ? `Website estimate: NT$${toK(r.low)}–${toK(r.high)}` : null,
      photoCount ? `Photos uploaded: ${photoCount}` : null,
      ref ? `Estimate Ref: ${ref}` : null,
      '',
      'Please help with a formal quote. Thank you.',
    ].filter((x) => x !== null).join('\n');
  }
  return [
    '您好，我想詢問收車：',
    '',
    `車型：${car}`,
    `里程：${formatKm(r.mileage)}`,
    ...condLines,
    hasRange ? `網站預估收購行情：${toWan(r.low)}–${toWan(r.high)}萬` : null,
    photoCount ? `已上傳照片：${photoCount} 張` : null,
    ref ? `估價編號：${ref}` : null,
    '',
    '請協助進一步估價，謝謝。',
  ].filter((x) => x !== null).join('\n');
}

// 有 LINE 官方帳號時可直接帶入訊息；個人 LINE 只能開啟加好友頁
export function lineChatUrl(text) {
  if (site.lineOaId) {
    return `https://line.me/R/oaMessage/${encodeURIComponent(site.lineOaId)}/?${encodeURIComponent(text)}`;
  }
  return site.lineUrl;
}
