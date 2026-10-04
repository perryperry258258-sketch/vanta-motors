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

// 性能版、頂級特殊版（GTI、Golf R、AMG C 43、M340i、S3、RS、Maybach、GTS、Turbo S、Performance…）
// 一般車沒有對到版本時，計算中位數要排除這些，避免被拉高；車名本身是性能版時則只用性能版
export const PERF_RE = /(\bGTI\b|Type ?R|Mercedes-AMG|\bAMG\s+[A-Z]{1,3}\s*\d{2}|\bM\d{3}[a-z]?\b|\bM\d0[id]?\b|M Competition|\bRS\s?\d\b|\bRS\b|\bS\d\b|\bGTS\b|Turbo S|Performance|Maybach|Black Edition|\bR\b(?!-?\s?(Line|Design)))/i;
const isPerf = (text) => PERF_RE.test(String(text || ''));
const isOriginal = (r) => (r.price_type || priceTypeOf(r.confidence)) === 'original';

function perfFilter(pool, carIsPerf) {
  const picked = pool.filter((r) => isPerf(r.version) === carIsPerf);
  return picked.length ? picked : pool;
}

// 搜尋優先順序：
// 1. 品牌＋車型＋年份＋版本相符
// 2. 品牌＋車型＋年份的「有來源」資料（多個版本取中位數，排除性能版）
// 3. 品牌＋車型最近年份的「有來源」資料（標示為 inferred）
//    ※ 不使用同年份的補值資料：補值常抄到單一版本（例如 Maybach、AMG）的價格，會嚴重失真
// 4. 整個車型都沒有來源資料時，才使用補值資料
// 5. 找不到回傳 null
export function pickHistorical(rows, { year, version }) {
  const list = (rows || []).filter((r) => r.reference_price > 0);
  if (!list.length) return null;
  const y = Number(year);
  const carIsPerf = isPerf(version);
  const sameClass = (r) => isPerf(r.version) === carIsPerf;
  const sameYear = list.filter((r) => Number(r.year) === y);

  if (version && sameYear.length) {
    const hit = findVersion(sameYear.filter((r) => r.version), version);
    if (hit) return pack(hit, { match: 'version' });
  }

  // 同年份、有來源、而且同類（一般車對一般版本；性能車對性能版本）
  const origAll = list.filter(isOriginal);
  const classOrig = origAll.filter(sameClass);
  const sameOrig = sameYear.filter(isOriginal);
  const sameYearPool = sameOrig.filter(sameClass).length ? sameOrig.filter(sameClass) : classOrig.length ? [] : sameOrig;
  if (sameYearPool.length) {
    const price = median(sameYearPool.map((r) => r.reference_price));
    const base = sameYearPool.length === 1 ? sameYearPool[0] : sameYearPool.find((r) => r.reference_price === price) || sameYearPool[0];
    return pack(base, {
      price,
      match: 'year',
      version: sameYearPool.length === 1 ? base.version || '' : '',
      versionCount: sameYearPool.length,
      price_type: 'original',
    });
  }

  // 最近年份：優先用同類的有來源資料；整個車型都沒有來源資料才用補值
  const byGap = (a, b) => Math.abs(Number(a.year) - y) - Math.abs(Number(b.year) - y) || Number(a.year) - Number(b.year);
  const source = classOrig.length ? classOrig : origAll.length ? origAll : perfFilter(list, carIsPerf);
  const sorted = [...source].sort(byGap);
  const nearestYear = Number(sorted[0].year);
  const sameNearest = sorted.filter((r) => Number(r.year) === nearestYear);
  const price = median(sameNearest.map((r) => r.reference_price));
  const exact = !origAll.length && nearestYear === y;
  return pack(sameNearest[0], {
    price,
    match: exact ? 'year' : 'nearest_year',
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

// 去除極端值（IQR 法）：同款車源價格差太多的不納入
export function trimOutliers(list) {
  if (list.length < 4) return [...list];
  const a = [...list].sort((x, y) => x - y);
  const q1 = a[Math.floor(a.length * 0.25)];
  const q3 = a[Math.floor(a.length * 0.75)];
  const iqr = q3 - q1;
  return a.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

export { median };
