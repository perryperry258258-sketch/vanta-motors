import { getSupabase, photoUrl } from './supabase';

export const PAGE_SIZE = 24;

function toCard(car) {
  const first = (car.car_photos || [])[0];
  return {
    id: car.id,
    slug: car.slug,
    title: car.title,
    year: car.year,
    cover: first ? photoUrl(first.path) : null,
  };
}

function cardQuery() {
  return getSupabase()
    .from('cars')
    .select('id, slug, title, brand, model, year, car_photos(path, sort_order)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .order('sort_order', { referencedTable: 'car_photos' })
    .limit(1, { referencedTable: 'car_photos' });
}

export async function latestCars(limit = 6) {
  const { data, error } = await cardQuery().limit(limit);
  if (error) throw error;
  return data.map(toCard);
}

export async function searchCars({ q = '', brand = '', year = '', page = 0 } = {}) {
  let query = cardQuery();
  if (brand) query = query.eq('brand', brand);
  if (year) query = query.eq('year', Number(year));
  const keyword = q.replace(/[%_,()]/g, ' ').trim();
  if (keyword) query = query.ilike('title', `%${keyword}%`);
  const from = page * PAGE_SIZE;
  const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { cars: data.map(toCard), hasMore: data.length === PAGE_SIZE };
}

export async function carFilters() {
  const { data, error } = await getSupabase()
    .from('cars')
    .select('brand, year')
    .eq('status', 'published')
    .limit(2000);
  if (error) throw error;
  return {
    brands: [...new Set(data.map((c) => c.brand).filter(Boolean))].sort(),
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
