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

// 比對用：去掉空白、括號、符號與重音（Coupé → coupe）
const norm = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s（）()\-_/]/g, '');

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

// 版本比對：完全相同優先；其次「車名裡包含的版本名稱」取最長（最具體），
// 例如車名「Cayenne Coupe GTS」同時包含 Cayenne、Cayenne Coupe GTS，要取後者；
// 最後才是「版本名稱包含車名」（例如只寫「旗艦」對到「2.0 旗艦」）取最短
export function findVersion(rows, version) {
  const v = norm(version);
  if (!v) return null;
  const exact = rows.find((r) => r.version && norm(r.version) === v);
  if (exact) return exact;
  const origFirst = (a, b) => (a.price_type === 'original' ? -1 : 0) - (b.price_type === 'original' ? -1 : 0);
  // 版本名稱太短（例如「S」）容易誤判，至少 3 個字元才做部分比對
  const inCar = rows.filter((r) => r.version && norm(r.version).length >= 3 && v.includes(norm(r.version)));
  if (inCar.length) return inCar.sort((a, b) => norm(b.version).length - norm(a.version).length || origFirst(a, b))[0];
  const contains = rows.filter((r) => r.version && v.length >= 3 && norm(r.version).includes(v));
  if (contains.length) return contains.sort((a, b) => norm(a.version).length - norm(b.version).length || origFirst(a, b))[0];
  return null;
}

// 性能版、頂級特殊版（GT4、GTI、Golf R、AMG C 43、M340i、RS、Maybach、GTS、Turbo S、Performance…）
// 一般車沒有對到版本時，計算中位數要排除這些，避免被拉高；車名本身是性能版時則只用性能版
export const PERF_RE = /(\bGT\d\b|\bGTI\b|Type ?R|Mercedes-AMG|\bAMG\s+[A-Z]{1,3}\s*\d{2}|\bM\d{3}[a-z]?\b|\bM\d0[id]?\b|M Competition|\bRS\s?\d\b|\bRS\b|\bGTS\b|Turbo S|Performance|Maybach|Black Edition|\bR\b(?!-?\s?(Line|Design)))/i;
// 「RS包」「RS套件」只是外觀套件，不是性能版
const KIT_RE = /\bRS\s*(包|套件|樣式|式|空力)/gi;
// Audi S3、S4、S5 是性能版，但 Luxgen S5 不是：S+數字只在 Audi 算性能版
const AUDI_S_RE = /\bS\d\b/i;
export function isPerf(text, brand) {
  const t = String(text || '').replace(KIT_RE, ' ');
  if (PERF_RE.test(t)) return true;
  return /audi/i.test(String(brand || '')) && AUDI_S_RE.test(t);
}
const isOriginal = (r) => (r.price_type || priceTypeOf(r.confidence)) === 'original';

// 網站公開顯示市場行情的條件：資料可信度不是 D；
// 性能版／特殊版（GT4、GTS、AMG、M、RS、Type R…）要對到同版本的新車價才顯示，否則容易嚴重低估
export function publicMarketCheck({ grade, match, carText, brand }) {
  if (!grade || grade === 'D') return 'low_data';
  if (isPerf(carText, brand) && match !== 'version' && match !== 'version_nearest') return 'perf';
  return null;
}
export function publicMarketOk(args) {
  return !publicMarketCheck(args);
}

function perfFilter(pool, carIsPerf, brand) {
  const picked = pool.filter((r) => isPerf(r.version, brand) === carIsPerf);
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
  const brand = list[0].brand;
  const carIsPerf = isPerf(version, brand);
  const sameClass = (r) => isPerf(r.version, brand) === carIsPerf;
  const sameYear = list.filter((r) => Number(r.year) === y);
  const byGap = (a, b) => Math.abs(Number(a.year) - y) - Math.abs(Number(b.year) - y) || Number(a.year) - Number(b.year);

  if (version && sameYear.length) {
    const hit = findVersion(sameYear.filter((r) => r.version), version);
    if (hit) return pack(hit, { match: 'version' });
  }

  // 其他年份的同一個版本（例如 2019 GTI 用 2018 GTI、2020 S5 GT225 用 2019 GT225 的新車價）
  const nearestVersion = () => {
    if (!version) return null;
    const years = [...new Set(list.map((r) => Number(r.year)))].sort((a, b) => Math.abs(a - y) - Math.abs(b - y) || a - b);
    for (const yr of years) {
      if (yr === y) continue;
      const hit = findVersion(list.filter((r) => Number(r.year) === yr && r.version && sameClass(r)), version);
      if (hit) return pack(hit, { match: 'version_nearest', price_type: 'inferred' });
    }
    return null;
  };
  // 性能版：同年份沒有這個版本時，優先用最接近年份的同版本
  if (carIsPerf) {
    const hit = nearestVersion();
    if (hit) return hit;
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

  // 一般車：同年份沒有資料時，先找其他年份的同一個版本
  if (!carIsPerf) {
    const hit = nearestVersion();
    if (hit) return hit;
  }

  // 最近年份：優先用同類的有來源資料；整個車型都沒有來源資料才用補值
  const source = classOrig.length ? classOrig : origAll.length ? origAll : perfFilter(list, carIsPerf, brand);
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
