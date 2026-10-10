import { getSupabase, photoUrl } from './supabase';
import { fetchAll } from './fetchAll';
import { lowMileageFilter, NEW_DAYS } from './carTags';

export const PAGE_SIZE = 24;

function toCard(car) {
  const first = (car.car_photos || [])[0];
  return {
    id: car.id,
    slug: car.slug,
    title: car.title,
    title_en: car.title_en,
    brand: car.brand,
    model: car.model,
    year: car.year,
    mileage: car.mileage,
    price: car.price,
    price_max: car.price_max,
    created_at: car.created_at,
    sold_at: car.sold_at,
    cover: first ? photoUrl(first.path) : null,
  };
}

// 排序方式：new 最新上架、year_desc 年份新到舊、year_asc 年份舊到新、km_asc 里程少到多
function cardQuery(sort = 'new', withCount = false) {
  let q = getSupabase()
    .from('cars')
    .select('id, slug, title, title_en, brand, model, year, mileage, price, price_max, created_at, sold_at, car_photos(path, sort_order)', withCount ? { count: 'exact' } : undefined)
    .eq('status', 'published');
  if (sort === 'year_desc') q = q.order('year', { ascending: false, nullsFirst: false });
  if (sort === 'year_asc') q = q.order('year', { ascending: true, nullsFirst: false });
  if (sort === 'km_asc') q = q.order('mileage', { ascending: true, nullsFirst: false });
  return q
    .order('created_at', { ascending: false })
    .order('sort_order', { referencedTable: 'car_photos' })
    .limit(1, { referencedTable: 'car_photos' });
}

export async function latestCars(limit = 6) {
  const { data, error } = await cardQuery().is('sold_at', null).limit(limit);
  if (error) throw error;
  return data.map(toCard);
}

// tag：'new' 新到車（7 天內上架）、'lowkm' 低里程（平均每年不到 1 萬公里）、'sold' 已售出
// 沒選「已售出」時只列在售的車
export async function searchCars({ q = '', brand = '', year = '', page = 0, sort = 'new', km = '', tag = '' } = {}) {
  let query = cardQuery(sort, true);
  query = tag === 'sold' ? query.not('sold_at', 'is', null) : query.is('sold_at', null);
  if (tag === 'new') query = query.gte('created_at', new Date(Date.now() - NEW_DAYS * 864e5).toISOString());
  if (tag === 'lowkm') query = query.or(lowMileageFilter());
  if (brand) query = query.eq('brand', brand);
  if (year) query = query.eq('year', Number(year));
  if (km) query = query.lte('mileage', Number(km));
  const keyword = q.replace(/[%_,()"]/g, ' ').trim();
  if (keyword) query = query.or(`title.ilike.%${keyword}%,title_en.ilike.%${keyword}%`);
  const from = page * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { cars: data.map(toCard), hasMore: data.length === PAGE_SIZE, total: count ?? null };
}

export async function carFilters() {
  const data = await fetchAll(() => getSupabase().from('cars').select('brand, year').eq('status', 'published').is('sold_at', null).order('id'));
  const brandCounts = {};
  data.forEach((c) => {
    if (c.brand) brandCounts[c.brand] = (brandCounts[c.brand] || 0) + 1;
  });
  return {
    brands: Object.keys(brandCounts).sort(),
    brandCounts,
    total: data.length,
    years: [...new Set(data.map((c) => c.year).filter(Boolean))].sort((a, b) => b - a),
  };
}

export async function getCarBySlug(slug) {
  const { data, error } = await getSupabase()
    .from('cars')
    .select('*, car_photos(path, sort_order)')
    .eq('slug', slug)
    .eq('status', 'published')
    .order('sort_order', { referencedTable: 'car_photos' })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, photos: (data.car_photos || []).map((p) => photoUrl(p.path)) };
}
