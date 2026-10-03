// 伺服器端：替一台在售車輛算出大概的市場行情（只能在伺服器使用）
import { matchBrand, matchModel } from './matchModel';
import { valuate, publicValuation } from './valuation';

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
