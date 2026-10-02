// 我要找車：選項、配對分數、尋車區間、LINE 訊息（前後台共用的純函式）

export const MILEAGE_OPTIONS = [
  ['30000', '3萬以下', 'Under 30K km'],
  ['50000', '5萬以下', 'Under 50K km'],
  ['80000', '8萬以下', 'Under 80K km'],
  ['100000', '10萬以下', 'Under 100K km'],
  ['', '不限', 'Any'],
];

// 單位：萬
export const BUDGET_OPTIONS = [
  ['0-50', '50萬以下', 'Under NT$500K'],
  ['50-80', '50–80萬', 'NT$500K–800K'],
  ['80-100', '80–100萬', 'NT$800K–1M'],
  ['100-150', '100–150萬', 'NT$1M–1.5M'],
  ['150-200', '150–200萬', 'NT$1.5M–2M'],
  ['200-', '200萬以上', 'Over NT$2M'],
  ['', '不限', 'Any'],
];

export const FUEL_OPTIONS = [['gasoline', '汽油', 'Gasoline'], ['diesel', '柴油', 'Diesel'], ['hybrid', '油電', 'Hybrid'], ['phev', '插電式油電', 'Plug-in Hybrid'], ['ev', '純電', 'Electric']];
export const BODY_OPTIONS = [['sedan', '轎車', 'Sedan'], ['hatchback', '掀背', 'Hatchback'], ['suv', 'SUV', 'SUV'], ['mpv', 'MPV', 'MPV'], ['wagon', '旅行車', 'Wagon'], ['coupe', '跑車', 'Coupe'], ['pickup', '貨卡', 'Pickup']];

export const FIND_STATUS = [
  ['new', '新需求'],
  ['in_progress', '客服處理中'],
  ['searching', '搜尋車源中'],
  ['candidates', '找到候選車'],
  ['offered', '已提供客戶'],
  ['viewing', '已安排看車'],
  ['quoted', '已報價'],
  ['won', '已成交'],
  ['lost', '未成交'],
  ['cancelled', '取消'],
];
export const FIND_STATUS_LABEL = Object.fromEntries(FIND_STATUS);

// VANTA 初步參數：尋車區間＝行情規則計算的中間值 × 這兩個倍數（只是大概，客人會看到「初步參考」）
export const SEARCH_FACTORS = { low: 1.08, high: 1.25 };

export function parseBudget(value) {
  if (!value) return { min: null, max: null };
  const [a, b] = String(value).split('-');
  return { min: a ? Number(a) * 10000 : null, max: b ? Number(b) * 10000 : null };
}

export function searchRange(center) {
  if (!center) return null;
  const step = 10000;
  return {
    low: Math.floor((center * SEARCH_FACTORS.low) / step) * step,
    high: Math.ceil((center * SEARCH_FACTORS.high) / step) * step,
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s\-_]/g, '');

// 需求與車輛的符合度（0–100），只在內部使用；前台只顯示高／中／部分符合
export function matchScore(req, car) {
  let score = 0;
  if (norm(car.brand) && norm(car.brand) === norm(req.brand)) score += 30;
  const cm = norm(car.model) || norm(car.title);
  const rm = norm(req.model);
  if (rm && cm && (cm.includes(rm) || rm.includes(cm))) score += 30;

  if (!req.year_from && !req.year_to) score += 10;
  else if (car.year) {
    const lo = req.year_from || req.year_to;
    const hi = req.year_to || req.year_from;
    const gap = car.year < lo ? lo - car.year : car.year > hi ? car.year - hi : 0;
    score += gap === 0 ? 15 : gap === 1 ? 10 : gap === 2 ? 5 : 0;
  }

  if (!req.mileage_max) score += 10;
  else if (!car.mileage) score += 5;
  else if (car.mileage <= req.mileage_max) score += 10;
  else if (car.mileage <= req.mileage_max * 1.2) score += 5;

  const pLo = car.price ? car.price * 10000 : null;
  const pHi = car.price_max ? car.price_max * 10000 : pLo;
  if (!req.budget_min && !req.budget_max) score += 15;
  else if (!pLo) score += 8;
  else {
    const bMin = req.budget_min || 0;
    const bMax = req.budget_max || Infinity;
    if (pLo <= bMax && pHi >= bMin) score += 15;
    else if (pLo <= bMax * 1.1 && pHi >= bMin * 0.9) score += 8;
  }
  return score;
}

export function matchTier(score) {
  if (score >= 80) return 'high';
  if (score >= 55) return 'mid';
  return 'partial';
}

export const TIER_LABEL = {
  zh: { high: '符合度高', mid: '符合度中', partial: '部分符合' },
  en: { high: 'Strong match', mid: 'Good match', partial: 'Partial match' },
};

function wan(n) {
  return `${+(n / 10000).toFixed(1)}`;
}

export function budgetText(lang, min, max) {
  if (!min && !max) return lang === 'en' ? 'Flexible' : '不限';
  if (lang === 'en') {
    const k = (n) => (n >= 1000000 ? `${+(n / 1000000).toFixed(2)}M` : `${Math.round(n / 1000)}K`);
    if (!min) return `Under NT$${k(max)}`;
    if (!max) return `Over NT$${k(min)}`;
    return `NT$${k(min)}–${k(max)}`;
  }
  if (!min) return `${wan(max)}萬以下`;
  if (!max) return `${wan(min)}萬以上`;
  return `${wan(min)}–${wan(max)}萬`;
}

export function findRef(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function buildFindMessage(lang, r) {
  const yearText = r.year ? `${r.year} ` : '';
  const km = r.mileageMax ? `${Number(r.mileageMax).toLocaleString('en-US')} km` : null;
  const range = r.range ? (lang === 'en'
    ? `NT$${Math.round(r.range.low / 1000)}K–${Math.round(r.range.high / 1000)}K`
    : `${wan(r.range.low)}–${wan(r.range.high)}萬`) : null;
  if (lang === 'en') {
    return [
      "Hello, I'd like VANTA to help me find a car.",
      '',
      `Vehicle: ${yearText}${r.brand} ${r.model}${r.year ? '' : ' (any year)'}`,
      `Mileage: ${km ? `under ${km}` : 'flexible'}`,
      `Budget: ${budgetText('en', r.budgetMin, r.budgetMax)}`,
      r.notes ? `Other needs: ${r.notes}` : null,
      range ? `Website estimate: ${range}` : null,
      `Find Ref: ${findRef(r.id)}`,
      '',
      'Thank you.',
    ].filter((x) => x !== null).join('\n');
  }
  return [
    '您好，我想請 VANTA 幫我找車。',
    '',
    `車型：${yearText}${r.brand} ${r.model}${r.year ? '' : '（年份不限）'}`,
    `里程：${km ? `${km} 以下` : '不限'}`,
    `預算：${budgetText('zh', r.budgetMin, r.budgetMax)}`,
    r.notes ? `其他需求：${r.notes}` : null,
    range ? `網站預估尋車區間：${range}` : null,
    `找車編號：${findRef(r.id)}`,
    '',
    '請協助找車，謝謝。',
  ].filter((x) => x !== null).join('\n');
}
