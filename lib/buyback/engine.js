// VANTA 規則式收購估價引擎（純計算，前後台共用）

export const DEFAULT_SETTINGS = {
  min_year: 2008,
  spread_low: 0.94,
  spread_high: 1.02,
  round_to: 10000,
  stale_days: 90,
};

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

const roundDown = (v, step) => Math.floor(v / step) * step;
const roundNear = (v, step) => Math.round(v / step) * step;

export function taiwanYear(date = new Date()) {
  return new Date(date.getTime() + 8 * 3600 * 1000).getUTCFullYear();
}

export function runEstimate({ rules, brand, year, mileage, depreciation, mileageRules, settings, currentYear }) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const step = Number(s.round_to) || 10000;
  const none = {
    quality: 'none', method: 'none', low: null, high: null, center: null, updatedAt: null,
    log: { match_quality: 'none', method: 'none' },
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
      quality, method: 'manual', low: manualLow, high: manualHigh, center, updatedAt,
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
  if (!(base > 0)) return hasManual ? manual('nearest') : none;

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

  let mileageFactor =
    num(rule.mileage_factor) !== null && fitsMileage(rule, mileage)
      ? num(rule.mileage_factor)
      : findFactor(mileageRules, mileage, 'km_min', 'km_max', false);
  if (mileageFactor === null) mileageFactor = 1;

  const brandFactor = num(rule.brand_factor) ?? num(brand && brand.brand_factor) ?? 1;

  const centerRaw = base * yearFactor * mileageFactor * brandFactor;
  const center = Math.round(centerRaw);
  const low = roundDown(centerRaw * Number(s.spread_low), step);
  let high = roundNear(centerRaw * Number(s.spread_high), step);
  if (high <= low) high = low + step;

  return {
    quality, method: 'formula', low, high, center, updatedAt,
    log: {
      pricing_rule_id: rule.id, base_price: base, reference_year: rule.reference_year,
      year_factor: yearFactor, mileage_factor: mileageFactor, brand_factor: brandFactor,
      estimated_center: center, estimated_low: low, estimated_high: high,
      match_quality: quality, method: 'formula', pricing_updated_at: updatedAt,
    },
  };
}
