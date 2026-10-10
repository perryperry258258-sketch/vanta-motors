// 來源追蹤：客人從哪裡來到網站（IG、FB、Google、LINE…），存在 cookie，詢問、找車、賣車時一起記錄
export const SOURCE_COOKIE = 'vanta_src';
export const SOURCE_DAYS = 30;

export const SOURCES = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['threads', 'Threads'],
  ['google', 'Google'],
  ['line', 'LINE'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['8891', '8891'],
  ['other', '其他'],
];
export const SOURCE_LABEL = Object.fromEntries(SOURCES);
export const MEDIUMS = [['post', '貼文／限動'], ['ad', '付費廣告'], ['bio', '個人檔案連結'], ['message', '訊息分享'], ['other', '其他']];
export const MEDIUM_LABEL = { ...Object.fromEntries(MEDIUMS), organic: '自然搜尋', referral: '外部連結' };

const ALIAS = { ig: 'instagram', insta: 'instagram', fb: 'facebook', meta: 'facebook', gg: 'google', yt: 'youtube' };
const clean = (v, n = 60) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '').slice(0, n);

// 從網址參數、來源網站判斷來源；判斷不出來（直接打網址）回傳 null
export function detectSource(search, referrer, ownHost) {
  const p = new URLSearchParams(search || '');
  const utm = clean(p.get('utm_source'));
  if (utm) {
    return {
      source: ALIAS[utm] || utm,
      medium: clean(p.get('utm_medium')) || null,
      campaign: clean(p.get('utm_campaign'), 80) || null,
    };
  }
  if (p.get('gclid')) return { source: 'google', medium: 'ad', campaign: null };
  if (p.get('fbclid')) return { source: 'facebook', medium: 'referral', campaign: null };
  if (p.get('igshid')) return { source: 'instagram', medium: 'referral', campaign: null };

  let host = '';
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : '';
  } catch {
    host = '';
  }
  if (!host || (ownHost && host.endsWith(ownHost.replace(/^www\./, '')))) return null;
  const rules = [
    [/(^|\.)google\./, 'google', 'organic'],
    [/(^|\.)instagram\.com$/, 'instagram', 'referral'],
    [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook', 'referral'],
    [/(^|\.)threads\.(net|com)$/, 'threads', 'referral'],
    [/(^|\.)line\.me$|(^|\.)line-apps\.com$/, 'line', 'referral'],
    [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube', 'referral'],
    [/(^|\.)tiktok\.com$/, 'tiktok', 'referral'],
    [/(^|\.)8891\.com\.tw$/, '8891', 'referral'],
    [/(^|\.)bing\.com$|(^|\.)yahoo\./, 'other', 'organic'],
  ];
  const hit = rules.find(([re]) => re.test(host));
  if (hit) return { source: hit[1], medium: hit[2], campaign: null };
  return { source: 'other', medium: 'referral', campaign: clean(host, 80) };
}

// 伺服器端：從 cookie 讀出來源（API 用）
export function readSource(req) {
  try {
    const raw = req.cookies && req.cookies.get ? req.cookies.get(SOURCE_COOKIE) : null;
    const value = raw && (raw.value || raw);
    if (!value) return {};
    const s = JSON.parse(decodeURIComponent(value));
    return {
      utm_source: clean(s.source) || null,
      utm_medium: clean(s.medium) || null,
      utm_campaign: clean(s.campaign, 80) || null,
    };
  } catch {
    return {};
  }
}

// 後台產生追蹤連結
export function buildTrackedUrl(base, source, medium, campaign) {
  try {
    const u = new URL(base);
    u.searchParams.set('utm_source', clean(source));
    if (medium) u.searchParams.set('utm_medium', clean(medium));
    if (campaign) u.searchParams.set('utm_campaign', clean(campaign, 80));
    return u.toString();
  } catch {
    return '';
  }
}
