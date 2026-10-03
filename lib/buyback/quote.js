// 伺服器端：替在售車輛算出大概的市場行情（只能在伺服器使用）
import { matchBrand, matchModel } from './matchModel';
import { valuate, publicValuation } from './valuation';
import { runEstimate, taiwanYear, DEFAULT_SETTINGS, findModelFactor, findCondition, priceRanges } from './engine';
import { pickHistorical, confidenceGrade, trimOutliers, median, blendValue } from './history';

// 單一車輛（車輛詳細頁）
export async function quoteForCar(db, car) {
  if (!car || !car.year) return null;

  const { data: brands } = await db
    .from('buyback_brands')
    .select('id, name, brand_factor, active, buyback_models(id, name, active)')
    .eq('active', true);
  const brand = matchBrand(brands, car);
  if (!brand) return null;
  const model = matchModel(brand.buyback_models, car);
  if (!model) return null;

  // 車名可能含版本（例如「2021 Toyota RAV4 2.0 旗艦」），交給歷史新車價比對
  const v = await valuate(db, {
    brand,
    model,
    year: Number(car.year),
    mileage: car.mileage ?? null,
    version: `${car.model || ''} ${car.title || ''}`,
    excludeCarId: car.id,
  });
  if (!v.value) return null;

  return {
    brand: brand.name,
    model: model.name,
    ...v.ranges,
    quality: v.quality,
    updatedAt: v.updatedAt,
    breakdown: v.breakdown,
    valuation: publicValuation(v),
  };
}

// 多台車一次計算（車輛列表、首頁卡片）：共用查詢，避免每台車各查一次資料庫
// 計算方式與 valuate 相同：歷史新車價 → 係數推算 → 混合同款車源中位數
export async function quoteCars(db, cars) {
  const list = (cars || []).filter((c) => c && c.id && c.year);
  if (!list.length) return {};
  const currentYear = taiwanYear();

  const [brandsRes, dep, km, set, mfs, conds, pub] = await Promise.all([
    db.from('buyback_brands').select('id, name, brand_factor, active, buyback_models(id, name, active)').eq('active', true),
    db.from('depreciation_rules').select('*').eq('active', true),
    db.from('mileage_rules').select('*').eq('active', true),
    db.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('model_factors').select('brand_id, model, factor'),
    db.from('condition_factors').select('*'),
    db.from('cars').select('id, title, brand, model, year, mileage, price, price_max').eq('status', 'published').limit(3000),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(set.data || {}) };
  const condition = findCondition(conds.data, 'normal');

  const matched = list
    .map((c) => {
      const b = matchBrand(brandsRes.data, c);
      const m = b ? matchModel(b.buyback_models, c) : null;
      return m ? { c, b, m } : null;
    })
    .filter(Boolean);
  if (!matched.length) return {};

  const modelNames = [...new Set(matched.map((x) => x.m.name))];
  const modelIds = [...new Set(matched.map((x) => x.m.id))];
  const [histRes, rulesRes] = await Promise.all([
    db.from('historical_vehicle_prices')
      .select('brand, model, year, version, reference_price, confidence, price_type, source, source_url')
      .in('model', modelNames)
      .limit(5000),
    db.from('pricing_rules').select('*').in('model_id', modelIds).eq('active', true),
  ]);

  const out = {};
  for (const { c, b, m } of matched) {
    const year = Number(c.year);
    const histRows = (histRes.data || []).filter((r) => r.brand === b.name && r.model === m.name);
    const hist = pickHistorical(histRows, { year, version: `${c.model || ''} ${c.title || ''}` });
    const common = {
      brand: b,
      year,
      mileage: c.mileage ?? null,
      depreciation: dep.data || [],
      mileageRules: km.data || [],
      settings,
      currentYear,
      modelFactor: findModelFactor((mfs.data || []).filter((x) => x.brand_id === b.id), m.name),
      condition,
    };
    const est = hist
      ? runEstimate({ ...common, rules: [{ id: null, reference_year: year, reference_price: hist.price, year_status: 'confirmed' }] })
      : runEstimate({ ...common, rules: (rulesRes.data || []).filter((r) => r.model_id === m.id) });
    const formula = est.method !== 'none' ? est.center : null;

    const prices = (pub.data || [])
      .filter((x) => x.id !== c.id && x.price && x.year && Math.abs(Number(x.year) - year) <= 1)
      .filter((x) => String(x.brand || '').toLowerCase() === b.name.toLowerCase() && matchModel([{ name: m.name }], x))
      .filter((x) => !c.mileage || !x.mileage || Math.abs(Number(x.mileage) - Number(c.mileage)) <= Math.max(30000, Number(c.mileage) * 0.4))
      .map((x) => Math.round(((Number(x.price) + Number(x.price_max || x.price)) / 2) * 10000));
    const kept = trimOutliers(prices);
    const value = blendValue(formula, median(kept), kept.length);
    if (!value) continue;

    out[c.id] = {
      market: priceRanges(value, settings).market,
      grade: hist ? confidenceGrade({ hist, comps: kept.length }) : 'C',
      estimated: !hist || hist.price_type !== 'original',
    };
  }
  return out;
}
