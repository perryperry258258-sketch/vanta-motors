// 歷史新車價格資料庫：純函式（前後台、測試共用）
// 資料來源：VANTA_vehicle_price_history_2012_2026_FINAL_COMPLETE.csv（不修改原始資料，只在匯入時正規化單位）

// confidence → price_type
// original：有歷史資料來源支持（high／medium／original）
// inferred：依鄰近年份或同車型補值（inferred／low）
export function priceTypeOf(confidence) {
  const c = String(confidence || '').trim().toLowerCase();
  if (['high', 'medium', 'original'].includes(c)) return 'original';
  return 'inferred';
}

// CSV 有部分資料以「萬元」記錄（例如 110.0），其餘以「元」記錄（例如 1330000.0）
// 兩者之間沒有重疊（萬元最大 3,300、元最小 509,000），所以小於 10,000 的一律視為萬元換算成元
export function normalizePrice(raw) {
  const v = Number(String(raw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(v) || v <= 0) return { price: null, normalized: false };
  if (v < 10000) return { price: Math.round(v * 10000), normalized: true };
  return { price: Math.round(v), normalized: false };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s（）()\-_/]/g, '');

function median(list) {
  const a = [...list].sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

function pack(row, extra) {
  return {
    price: row.reference_price,
    confidence: row.confidence,
    source: row.source,
    source_url: row.source_url,
    price_type: row.price_type || priceTypeOf(row.confidence),
    priceYear: Number(row.year),
    version: row.version || '',
    notes: row.notes || '',
    ...extra,
  };
}

// 版本比對：完全相同優先，其次互相包含（例如「旗艦」對到「2.0 旗艦」）
export function findVersion(rows, version) {
  const v = norm(version);
  if (!v) return null;
  const exact = rows.find((r) => r.version && norm(r.version) === v);
  if (exact) return exact;
  // 版本名稱太短（例如「S」）容易誤判，至少 3 個字元才做部分比對
  const partial = rows.filter((r) => r.version && norm(r.version).length >= 3 && (norm(r.version).includes(v) || v.includes(norm(r.version))));
  if (!partial.length) return null;
  // 多筆符合時取版本名稱最短（最接近）的那一筆，同長度取 original
  return partial.sort((a, b) => norm(a.version).length - norm(b.version).length || (a.price_type === 'original' ? -1 : 1))[0];
}

// 搜尋優先順序：
// 1. 品牌＋車型＋年份＋版本完全相符
// 2. 品牌＋車型＋年份（多個版本取中位數，original 優先）
// 3. 品牌＋車型最近年份（original 優先；用其他年份的價格一律標示為 inferred）
// 4. 只剩 inferred 資料時使用 inferred
// 5. 找不到回傳 null
export function pickHistorical(rows, { year, version }) {
  const list = (rows || []).filter((r) => r.reference_price > 0);
  if (!list.length) return null;
  const y = Number(year);
  const sameYear = list.filter((r) => Number(r.year) === y);

  if (version && sameYear.length) {
    const hit = findVersion(sameYear, version);
    if (hit) return pack(hit, { match: 'version' });
  }

  if (sameYear.length) {
    const orig = sameYear.filter((r) => (r.price_type || priceTypeOf(r.confidence)) === 'original');
    const pool = orig.length ? orig : sameYear;
    const price = median(pool.map((r) => r.reference_price));
    const base = pool.length === 1 ? pool[0] : pool.find((r) => r.reference_price === price) || pool[0];
    return pack(base, {
      price,
      match: 'year',
      version: pool.length === 1 ? base.version || '' : '',
      versionCount: pool.length,
      price_type: orig.length ? 'original' : 'inferred',
    });
  }

  const byGap = (a, b) => Math.abs(Number(a.year) - y) - Math.abs(Number(b.year) - y) || Number(a.year) - Number(b.year);
  const orig = list.filter((r) => (r.price_type || priceTypeOf(r.confidence)) === 'original').sort(byGap);
  const pool = orig.length ? orig : [...list].sort(byGap);
  const nearestYear = Number(pool[0].year);
  const sameNearest = pool.filter((r) => Number(r.year) === nearestYear);
  const price = median(sameNearest.map((r) => r.reference_price));
  return pack(sameNearest[0], {
    price,
    match: 'nearest_year',
    version: '',
    versionCount: sameNearest.length,
    price_type: 'inferred',
  });
}

// 資料可信度
// A：歷史新車價可靠＋同款車源足夠（≥5）
// B：歷史新車價可靠，但車源較少（2～4）
// C：歷史新車價為推估，或車源不足
// D：資料不足，只能粗略估算
export function confidenceGrade({ hist, comps }) {
  const n = comps || 0;
  if (!hist) return n >= 2 ? 'D' : 'D';
  const lowSeed = String(hist.confidence).toLowerCase() === 'low';
  if (hist.price_type === 'original') {
    if (n >= 5) return 'A';
    if (n >= 2) return 'B';
    return 'C';
  }
  if (lowSeed && n < 2) return 'D';
  return 'C';
}

export const GRADE_LABEL = {
  zh: { A: 'A｜資料充足', B: 'B｜新車價可靠、車源較少', C: 'C｜部分資料為推估', D: 'D｜資料不足，僅供粗略參考' },
  en: { A: 'A | Strong data', B: 'B | Reliable new-car price, few listings', C: 'C | Partly estimated', D: 'D | Limited data, rough guide only' },
};

// 排除異常價格（四分位距法），樣本太少就不排除
export function trimOutliers(values) {
  const a = [...values].sort((x, y) => x - y);
  if (a.length < 4) return a;
  const q = (p) => a[Math.floor((a.length - 1) * p)];
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  return a.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

export { median };

// 系統估值：歷史新車價公式結果與目前車源中位數混合
// 車源 ≥5：車源 70%＋公式 30%；2～4：各 50%；不足 2：只用公式
export function blendValue(formulaValue, marketMedian, comps) {
  if (marketMedian && comps >= 5) return Math.round(marketMedian * 0.7 + (formulaValue || marketMedian) * 0.3);
  if (marketMedian && comps >= 2) return Math.round(marketMedian * 0.5 + (formulaValue || marketMedian) * 0.5);
  return formulaValue || null;
}

export function depreciationRate(newPrice, value) {
  if (!(newPrice > 0) || !(value > 0)) return null;
  return Math.round(((newPrice - value) / newPrice) * 1000) / 1000;
}
