// 伺服器端：中古車估價（歷史新車價＋目前車源）
// 流程：歷史新車價 → 車齡、里程等係數 → 目前同款車源中位數 → 混合成系統估值 → 價格區間、折舊率、資料可信度
import { runEstimate, taiwanYear, DEFAULT_SETTINGS, findModelFactor, findCondition, priceRanges } from './engine';
import { pickHistorical, confidenceGrade, trimOutliers, median, blendValue, depreciationRate } from './history';
import { matchModel } from './matchModel';

export async function getHistoricalNewCarPrice(db, { brand, model, year, version }) {
  const empty = { price: null, confidence: null, source: null, source_url: null, price_type: 'unavailable' };
  if (!brand || !model || !year) return empty;
  const { data, error } = await db
    .from('historical_vehicle_prices')
    .select('year, version, reference_price, confidence, price_type, source, source_url, notes')
    .eq('brand', brand)
    .eq('model', model)
    .limit(1000);
  if (error) {
    console.error('historical price lookup failed', error.message);
    return empty;
  }
  return pickHistorical(data || [], { year, version }) || empty;
}

// VANTA 目前上架車輛中的同款車源（同車型、年份 ±1、里程相近）
export async function findComparables(db, { brandName, model, year, mileage, excludeCarId }) {
  const { data } = await db
    .from('cars')
    .select('id, title, brand, model, year, mileage, price, price_max')
    .eq('status', 'published')
    .ilike('brand', brandName)
    .limit(500);
  const prices = (data || [])
    .filter((c) => c.id !== excludeCarId && c.price && c.year && Math.abs(Number(c.year) - Number(year)) <= 1)
    .filter((c) => matchModel([{ name: model }], c))
    .filter((c) => {
      if (!mileage || !c.mileage) return true;
      return Math.abs(Number(c.mileage) - Number(mileage)) <= Math.max(30000, Number(mileage) * 0.4);
    })
    .map((c) => Math.round(((Number(c.price) + Number(c.price_max || c.price)) / 2) * 10000));
  const kept = trimOutliers(prices);
  return {
    count: kept.length,
    median: median(kept),
    low: kept.length ? Math.min(...kept) : null,
    high: kept.length ? Math.max(...kept) : null,
  };
}

export async function valuate(db, { brand, model, year, mileage, version, conditionKey = 'normal', excludeCarId = null }) {
  const currentYear = taiwanYear();
  const [hist, ctx, comps] = await Promise.all([
    getHistoricalNewCarPrice(db, { brand: brand.name, model: model.name, year, version }),
    Promise.all([
      db.from('depreciation_rules').select('*').eq('active', true),
      db.from('mileage_rules').select('*').eq('active', true),
      db.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
      db.from('model_factors').select('model, factor').eq('brand_id', brand.id),
      db.from('condition_factors').select('*'),
    ]),
    findComparables(db, { brandName: brand.name, model: model.name, year, mileage, excludeCarId }),
  ]);
  const [dep, km, set, mfs, conds] = ctx;
  const settings = { ...DEFAULT_SETTINGS, ...(set.data || {}) };
  const common = {
    brand,
    year: Number(year),
    mileage: mileage ?? null,
    depreciation: dep.data || [],
    mileageRules: km.data || [],
    settings,
    currentYear,
    modelFactor: findModelFactor(mfs.data, model.name),
    condition: findCondition(conds.data, conditionKey),
  };

  // 有歷史新車價：用它當新車基準價；沒有：沿用原本的行情規則（不影響原有估價）
  let est;
  let legacy = false;
  if (hist.price) {
    est = runEstimate({
      ...common,
      rules: [{ id: null, reference_year: Number(year), reference_price: hist.price, source: hist.source, year_status: 'confirmed' }],
    });
  } else {
    legacy = true;
    const { data: rules } = await db.from('pricing_rules').select('*').eq('model_id', model.id).eq('active', true);
    est = runEstimate({ ...common, rules: rules || [] });
  }

  const formula = est.method !== 'none' ? est.center : null;
  const value = blendValue(formula, comps.median, comps.count);
  let grade = null;
  if (hist.price) grade = confidenceGrade({ hist, comps: comps.count });
  else if (formula) grade = 'C';
  else if (value) grade = 'D';

  const ranges = value ? priceRanges(value, settings) : null;
  const breakdown = est.breakdown
    ? {
        ...est.breakdown,
        priceYear: hist.price ? hist.priceYear : est.breakdown.priceYear,
        priceYearExact: hist.price ? hist.priceYear === Number(year) && hist.price_type === 'original' : est.breakdown.priceYearExact,
        market: formula,
      }
    : null;

  return {
    value,
    formula,
    ranges,
    grade,
    legacy,
    quality: grade === 'A' || grade === 'B' ? 'exact' : value ? 'nearest' : 'none',
    updatedAt: est.updatedAt,
    depreciation: hist.price ? depreciationRate(hist.price, value) : null,
    hist: hist.price
      ? {
          price: hist.price,
          price_type: hist.price_type,
          confidence: hist.confidence,
          match: hist.match,
          priceYear: hist.priceYear,
          version: hist.version || '',
          versionCount: hist.versionCount || 1,
          source: hist.source,
          source_url: hist.source_url,
        }
      : null,
    comps,
    breakdown,
    settings,
    log: {
      ...est.log,
      estimated_center: value,
      estimated_low: ranges ? ranges.buyback.low : null,
      estimated_high: ranges ? ranges.buyback.high : null,
      historical_price: hist.price || null,
      historical_price_type: hist.price_type,
      comps_count: comps.count,
      data_grade: grade,
      system_value: value,
    },
  };
}

// 傳給前台的精簡結果
export function publicValuation(v) {
  if (!v) return null;
  return {
    value: v.value,
    grade: v.grade,
    depreciation: v.depreciation,
    hist: v.hist,
    comps: { count: v.comps.count, low: v.comps.low, high: v.comps.high, median: v.comps.median },
  };
}
