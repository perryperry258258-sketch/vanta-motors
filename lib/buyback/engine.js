// VANTA 規則式收購估價引擎（純計算，前後台共用）

export const DEFAULT_SETTINGS = {
  min_year: 2008,
  spread_low: 0.80, // 車商建議收購價：市場行情 × 下緣～上緣
  spread_high: 0.88,
  market_low: 0.92, // 市場行情價：市場行情 × 下緣～上緣
  market_high: 1.08,
  retail_low: 1.00, // 預估對客售價：市場行情 × 下緣～上緣
  retail_high: 1.10,
  round_to: 10000,
  stale_days: 90,
};

// 用市場行情中間值算出一個大概的範圍（下緣無條件捨去、上緣無條件進位到 round_to）
export function rangeFrom(center, low, high, step = 10000) {
  if (!(center > 0)) return null;
  const lo = Math.floor((center * Number(low)) / step + 1e-9) * step;
  let hi = Math.ceil((center * Number(high)) / step - 1e-9) * step;
  if (hi <= lo) hi = lo + step;
  return { low: lo, high: hi };
}

// 三種價格：市場行情價、預估對客售價、車商建議收購價
export function priceRanges(center, settings) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const step = Number(s.round_to) || 10000;
  return {
    market: rangeFrom(center, s.market_low, s.market_high, step),
    retail: rangeFrom(center, s.retail_low, s.retail_high, step),
    buyback: rangeFrom(center, s.spread_low, s.spread_high, step),
  };
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function fitsMileage(rule, km) {
  const min = num(rule.mileage_min);
  const max = num(rule.mileage_max);
  return (min === null || km >= min) && (max === null || km < max);
}

function usable(rule) {
  if (rule.active === false) return false;
  return num(rule.reference_price) > 0 || (num(rule.estimated_low) > 0 && num(rule.estimated_high) > 0);
}

// 找最適合的行情規則：基準年份 <= 車輛年份中最接近的，再看里程是否符合
export function pickRule(rules, year, km) {
  const list = (rules || []).filter(usable);
  if (!list.length) return null;
  const eligible = list.filter((r) => Number(r.reference_year) <= year);
  const pool = eligible.length ? eligible : list;
  const ranked = [...pool].sort((a, b) => {
    const d = Math.abs(year - a.reference_year) - Math.abs(year - b.reference_year);
    if (d) return d;
    const f = (fitsMileage(a, km) ? 0 : 1) - (fitsMileage(b, km) ? 0 : 1);
    if (f) return f;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
  const rule = ranked[0];
  return { rule, exact: eligible.length > 0 && fitsMileage(rule, km) };
}

export function findFactor(rows, value, minKey, maxKey, maxInclusive) {
  const row = (rows || [])
    .filter((x) => x.active !== false)
    .find((x) => {
      const min = Number(x[minKey]);
      const max = num(x[maxKey]);
      return value >= min && (max === null || (maxInclusive ? value <= max : value < max));
    });
  return row ? Number(row.factor) : null;
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// 車款係數：品牌＋車款一起判斷（rows 只會傳入同一個品牌的設定）；找不到就是 1.00
export function findModelFactor(rows, modelName) {
  const key = norm(modelName);
  const row = (rows || []).find((r) => norm(r.model) === key);
  const f = row ? Number(row.factor) : NaN;
  return Number.isFinite(f) && f > 0 ? f : 1;
}

// 車況係數：找不到或沒選就用「正常」1.00
export function findCondition(rows, key) {
  const row = (rows || []).find((r) => r.key === key) || (rows || []).find((r) => r.key === 'normal');
  const f = row ? Number(row.factor) : NaN;
  return {
    key: row ? row.key : 'normal',
    label_zh: row ? row.label_zh : '正常',
    label_en: row ? row.label_en : 'Normal',
    factor: Number.isFinite(f) && f > 0 ? f : 1,
  };
}

const roundDown = (v, step) => Math.floor(v / step) * step;
const roundNear = (v, step) => Math.round(v / step) * step;

export function taiwanYear(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000).getUTCFullYear();
}

// V2：市場行情 ＝ 新車參考價 × 年份 × 里程 × 品牌 × 車款 × 車況（四捨五入到元）
// 收購行情 ＝ 市場行情 × 估價設定的區間下緣～上緣
export function runEstimate({
  rules, brand, year, mileage, depreciation, mileageRules, settings, currentYear,
  modelFactor = 1, condition = null,
}) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const step = Number(s.round_to) || 10000;
  const cond = condition || { key: 'normal', label_zh: '正常', label_en: 'Normal', factor: 1 };
  const none = {
    quality: 'none', method: 'none', low: null, high: null, center: null, updatedAt: null, breakdown: null,
    reason: 'missing_reference_price',
    log: { match_quality: 'none', method: 'none', condition: cond.key },
  };

  const picked = pickRule(rules, year, mileage);
  if (!picked) return none;
  const { rule, exact } = picked;
  const updatedAt = rule.source_updated_at || (rule.updated_at ? String(rule.updated_at).slice(0, 10) : null);
  const manualLow = num(rule.estimated_low);
  const manualHigh = num(rule.estimated_high);
  const base = num(rule.reference_price);

  const manual = (quality) => {
    const center = Math.round((manualLow + manualHigh) / 2);
    return {
      quality, method: 'manual', low: manualLow, high: manualHigh, center, updatedAt, breakdown: null,
      log: {
        pricing_rule_id: rule.id, base_price: base, reference_year: rule.reference_year,
        year_factor: null, mileage_factor: null, brand_factor: null,
        estimated_center: center, estimated_low: manualLow, estimated_high: manualHigh,
        match_quality: quality, method: 'manual', pricing_updated_at: updatedAt,
      },
    };
  };

  const hasManual = manualLow > 0 && manualHigh >= manualLow;
  if (hasManual && exact && Number(rule.reference_year) === year) return manual('exact');
  if (!(base > 0) || !Number.isFinite(base)) return hasManual ? manual('nearest') : none;

  let quality = exact ? 'exact' : 'nearest';
  const age = Math.max(0, (currentYear || taiwanYear()) - year);

  let yearFactor = num(rule.year_factor);
  if (yearFactor === null) {
    yearFactor = findFactor(depreciation, age, 'age_min', 'age_max', true);
    if (yearFactor === null) {
      const all = (depreciation || []).map((d) => Number(d.factor)).filter(Number.isFinite);
      yearFactor = all.length ? Math.min(...all) : 1;
      quality = 'nearest';
    }
  }

  const hasMileage = mileage !== null && mileage !== undefined && Number.isFinite(Number(mileage));
  let mileageFactor = null;
  if (hasMileage) {
    mileageFactor =
      num(rule.mileage_factor) !== null && fitsMileage(rule, mileage)
        ? num(rule.mileage_factor)
        : findFactor(mileageRules, Number(mileage), 'km_min', 'km_max', false);
  }
  if (mileageFactor === null || !Number.isFinite(mileageFactor)) mileageFactor = 1;

  let brandFactor = num(rule.brand_factor) ?? num(brand && brand.brand_factor) ?? 1;
  if (!Number.isFinite(brandFactor) || brandFactor <= 0) brandFactor = 1;
  const mf = Number.isFinite(Number(modelFactor)) && Number(modelFactor) > 0 ? Number(modelFactor) : 1;
  const cf = Number.isFinite(Number(cond.factor)) && Number(cond.factor) > 0 ? Number(cond.factor) : 1;

  const centerRaw = base * yearFactor * mileageFactor * brandFactor * mf * cf;
  const center = Math.round(centerRaw);
  const low = roundDown(center * Number(s.spread_low), step);
  let high = roundNear(center * Number(s.spread_high), step);
  if (high <= low) high = low + step;

  return {
    quality, method: 'formula', low, high, center, updatedAt,
    breakdown: {
      referencePrice: base,
      age,
      yearFactor,
      mileage: hasMileage ? Number(mileage) : null,
      mileageFactor,
      brandFactor,
      modelFactor: mf,
      condition: cond.key,
      conditionLabelZh: cond.label_zh,
      conditionLabelEn: cond.label_en,
      conditionFactor: cf,
      market: center,
    },
    log: {
      pricing_rule_id: rule.id, base_price: base, reference_year: rule.reference_year,
      year_factor: yearFactor, mileage_factor: mileageFactor, brand_factor: brandFactor,
      model_factor: mf, condition_factor: cf, condition: cond.key,
      estimated_center: center, estimated_low: low, estimated_high: high,
      match_quality: quality, method: 'formula', pricing_updated_at: updatedAt,
    },
  };
}
