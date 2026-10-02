// 伺服器端：替一台在售車輛算出大概的市場行情（只能在伺服器使用）
import { runEstimate, taiwanYear, DEFAULT_SETTINGS, findModelFactor, findCondition, priceRanges } from './engine';
import { matchBrand, matchModel } from './matchModel';

export async function quoteForCar(db, car) {
  if (!car || !car.year) return null;
  const currentYear = taiwanYear();

  const { data: brands } = await db
    .from('buyback_brands')
    .select('id, name, brand_factor, active, buyback_models(id, name, active)')
    .eq('active', true);
  const brand = matchBrand(brands, car);
  if (!brand) return null;
  const model = matchModel(brand.buyback_models, car);
  if (!model) return null;

  const [rules, dep, km, settings, mfs, conds] = await Promise.all([
    db.from('pricing_rules').select('*').eq('model_id', model.id).eq('active', true),
    db.from('depreciation_rules').select('*').eq('active', true),
    db.from('mileage_rules').select('*').eq('active', true),
    db.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('model_factors').select('model, factor').eq('brand_id', brand.id),
    db.from('condition_factors').select('*'),
  ]);
  const s = { ...DEFAULT_SETTINGS, ...(settings.data || {}) };
  const est = runEstimate({
    rules: rules.data || [],
    brand,
    year: Number(car.year),
    mileage: car.mileage ?? null,
    depreciation: dep.data || [],
    mileageRules: km.data || [],
    settings: s,
    currentYear,
    modelFactor: findModelFactor(mfs.data, model.name),
    condition: findCondition(conds.data, 'normal'),
  });
  if (est.method !== 'formula' || !est.center) return null;

  return {
    brand: brand.name,
    model: model.name,
    ...priceRanges(est.center, s),
    quality: est.quality,
    updatedAt: est.updatedAt,
    breakdown: est.breakdown,
  };
}
