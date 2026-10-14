// 伺服器端：替在售車輛算出大概的市場行情（只能在伺服器使用）
import { matchBrand, matchModel } from './matchModel';
import { valuate, publicValuation } from './valuation';
import { runEstimate, taiwanYear, DEFAULT_SETTINGS, findModelFactor, findCondition, priceRanges } from './engine';
import { pickHistorical, confidenceGrade, trimOutliers, median, blendValue, publicMarketCheck } from './history';
import { fetchAll } from '../fetchAll';

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
    publicOk: !publicMarketCheck({ grade: v.grade, match: v.hist && v.hist.match, carText: `${car.model || ''} ${car.title || ''}`, brand: brand.name }),
    ...v.ranges,
    quality: v.quality,
    updatedAt: v.updatedAt,
    breakdown: v.breakdown,
    valuation: publicValuation(v),
  };
}

// 共用資料快取：品牌、折舊、里程、係數、在售車源、歷史新車價，10 分鐘內重複使用，不用每次都重新讀資料庫
const TTL = 10 * 60 * 1000;
let baseCache = null;
const resultCache = new Map();

async function loadBase(db, fresh = false) {
  if (!fresh && baseCache && Date.now() - baseCache.at < TTL) return baseCache.data;
  const [brandsRes, dep, km, set, mfs, conds, pub, hist, rules] = await Promise.all([
    db.from('buyback_brands').select('id, name, brand_factor, active, buyback_models(id, name, active)').eq('active', true),
    db.from('depreciation_rules').select('*').eq('active', true),
    db.from('mileage_rules').select('*').eq('active', true),
    db.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('model_factors').select('brand_id, model, factor'),
    db.from('condition_factors').select('*'),
    fetchAll(() => db.from('cars').select('id, title, brand, model, year, mileage, price, price_max').eq('status', 'published').order('id')),
    // 歷史新車價整份讀一次（超過 1,000 筆要分頁讀完）
    fetchAll(() =>
      db.from('historical_vehicle_prices')
        .select('brand, model, year, version, reference_price, confidence, price_type, source, source_url')
        .order('id')
    ),
    db.from('pricing_rules').select('*').eq('active', true),
  ]);
  const data = {
    brands: brandsRes.data || [],
    dep: dep.data || [],
    km: km.data || [],
    settings: { ...DEFAULT_SETTINGS, ...(set.data || {}) },
    mfs: mfs.data || [],
    condition: findCondition(conds.data, 'normal'),
    pub: pub || [],
    hist: hist || [],
    rules: rules.data || [],
  };
  baseCache = { at: Date.now(), data };
  return data;
}

// 多台車一次計算（車輛列表、首頁卡片）：共用查詢，避免每台車各查一次資料庫
// 計算方式與 valuate 相同：歷史新車價 → 係數推算 → 混合同款車源中位數
// 同一台車 10 分鐘內只算一次；後台檢查時傳 { fresh: true } 直接用最新資料
export async function quoteCars(db, cars, { fresh = false } = {}) {
  const list = (cars || []).filter((c) => c && c.id && c.year);
  if (!list.length) return {};
  const now = Date.now();
  const keyOf = (c) => `${c.id}|${c.year}|${c.mileage || ''}|${c.model || ''}|${c.title || ''}`;

  const out = {};
  const todo = [];
  for (const c of list) {
    const hit = fresh ? null : resultCache.get(keyOf(c));
    if (hit && now - hit.at < TTL) {
      if (hit.value) out[c.id] = hit.value;
    } else {
      todo.push(c);
    }
  }
  if (!todo.length) return out;

  const base = await loadBase(db, fresh);
  const currentYear = taiwanYear();

  for (const c of todo) {
    const value = quoteOne(base, c, currentYear);
    resultCache.set(keyOf(c), { at: now, value });
    if (value) out[c.id] = value;
  }
  // 快取不要無限長大
  if (resultCache.size > 3000) {
    for (const [k, v] of resultCache) if (now - v.at >= TTL) resultCache.delete(k);
  }
  return out;
}

function quoteOne(base, c, currentYear) {
  const b = matchBrand(base.brands, c);
  const m = b ? matchModel(b.buyback_models, c) : null;
  if (!m) return null;

  const year = Number(c.year);
  const histRows = base.hist.filter((r) => r.brand === b.name && r.model === m.name);
  const hist = pickHistorical(histRows, { year, version: `${c.model || ''} ${c.title || ''}` });
  const common = {
    brand: b,
    year,
    mileage: c.mileage ?? null,
    depreciation: base.dep,
    mileageRules: base.km,
    settings: base.settings,
    currentYear,
    modelFactor: findModelFactor(base.mfs.filter((x) => x.brand_id === b.id), m.name),
    condition: base.condition,
  };
  const est = hist
    ? runEstimate({ ...common, rules: [{ id: null, reference_year: year, reference_price: hist.price, year_status: 'confirmed' }] })
    : runEstimate({ ...common, rules: base.rules.filter((r) => r.model_id === m.id) });
  const formula = est.method !== 'none' ? est.center : null;

  const prices = base.pub
    .filter((x) => x.id !== c.id && x.price && x.year && Math.abs(Number(x.year) - year) <= 1)
    .filter((x) => String(x.brand || '').toLowerCase() === b.name.toLowerCase() && matchModel([{ name: m.name }], x))
    .filter((x) => !c.mileage || !x.mileage || Math.abs(Number(x.mileage) - Number(c.mileage)) <= Math.max(30000, Number(c.mileage) * 0.4))
    .map((x) => Math.round(((Number(x.price) + Number(x.price_max || x.price)) / 2) * 10000));
  const kept = trimOutliers(prices);
  const value = blendValue(formula, median(kept), kept.length);
  if (!value) return null;

  const grade = hist ? confidenceGrade({ hist, comps: kept.length }) : 'C';
  // 網站卡片是否顯示：資料不足（D）或性能版沒有對到同版本新車價時不顯示
  const hiddenReason = publicMarketCheck({ grade, match: hist && hist.match, carText: `${c.model || ''} ${c.title || ''}`, brand: b.name });
  return {
    market: priceRanges(value, base.settings).market,
    grade,
    estimated: !hist || hist.price_type !== 'original',
    publicOk: !hiddenReason,
    hiddenReason,
  };
}
