import { site } from '../site';

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

export function buildLineMessage(lang, r, photoCount = 0) {
  const car = `${r.year} ${r.brand} ${r.model}`;
  const hasRange = r.low && r.high;
  if (lang === 'en') {
    return [
      "Hello, I'd like a quote for selling my car:",
      '',
      `Vehicle: ${car}`,
      `Mileage: ${formatKm(r.mileage)}`,
      hasRange ? `Website estimate: NT$${toK(r.low)}–${toK(r.high)}` : null,
      photoCount ? `Photos uploaded: ${photoCount}` : null,
      '',
      'Please help with a formal quote. Thank you.',
    ].filter((x) => x !== null).join('\n');
  }
  return [
    '您好，我想詢問收車：',
    '',
    `車型：${car}`,
    `里程：${formatKm(r.mileage)}`,
    hasRange ? `網站預估收購行情：${toWan(r.low)}–${toWan(r.high)}萬` : null,
    photoCount ? `已上傳照片：${photoCount} 張` : null,
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
