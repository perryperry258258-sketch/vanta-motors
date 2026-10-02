import { NextResponse } from 'next/server';
import { getAdminSupabase, UUID_RE } from '../../../lib/supabaseAdmin';
import { runEstimate, taiwanYear, DEFAULT_SETTINGS } from '../../../lib/buyback/engine';
import { searchRange, matchScore, matchTier } from '../../../lib/find';
import { photoUrl } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const clean = (v, max) => String(v || '').trim().slice(0, max) || null;
const intOrNull = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v)));

// 建立找車需求：計算大概的尋車區間、比對現有車源
export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || !UUID_RE.test(String(b.modelId || ''))) return fail('invalid model');
  const lang = b.lang === 'en' ? 'en' : 'zh';
  const currentYear = taiwanYear();
  const year = intOrNull(b.year);
  if (year !== null && (year < 1990 || year > currentYear)) return fail('invalid year');
  const mileageMax = intOrNull(b.mileageMax);
  const budgetMin = intOrNull(b.budgetMin);
  const budgetMax = intOrNull(b.budgetMax);

  try {
    const db = getAdminSupabase();
    const { data: model } = await db
      .from('buyback_models')
      .select('id, name, active, brand:buyback_brands(id, name, brand_factor, active)')
      .eq('id', b.modelId)
      .maybeSingle();
    if (!model || !model.active || !model.brand || !model.brand.active) return fail('model not found', 404);

    // 大概的尋車區間：只有選了年份、而且這個車型有行情規則時才計算
    let range = null;
    let confidence = 'none';
    let updatedAt = null;
    if (year) {
      const [rules, dep, km, settings] = await Promise.all([
        db.from('pricing_rules').select('*').eq('model_id', model.id).eq('active', true),
        db.from('depreciation_rules').select('*').eq('active', true),
        db.from('mileage_rules').select('*').eq('active', true),
        db.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
      ]);
      const est = runEstimate({
        rules: rules.data || [],
        brand: model.brand,
        year,
        mileage: mileageMax ? Math.round(mileageMax * 0.7) : 60000,
        depreciation: dep.data || [],
        mileageRules: km.data || [],
        settings: { ...DEFAULT_SETTINGS, ...(settings.data || {}) },
        currentYear,
      });
      if (est.center) {
        range = searchRange(est.center);
        confidence = est.quality === 'exact' ? 'medium' : 'low';
        updatedAt = est.updatedAt;
      }
    }

    // 比對 VANTA 現有上架車輛
    const { data: cars } = await db
      .from('cars')
      .select('id, slug, title, title_en, brand, model, year, mileage, price, price_max, car_photos(path, sort_order)')
      .eq('status', 'published')
      .ilike('brand', model.brand.name)
      .limit(300);
    const request = {
      brand: model.brand.name,
      model: model.name,
      year_from: year,
      year_to: year,
      mileage_max: mileageMax,
      budget_min: budgetMin,
      budget_max: budgetMax,
    };
    const matches = (cars || [])
      .map((c) => ({ c, score: matchScore(request, c) }))
      .filter((x) => x.score >= 55)
      .sort((a, z) => z.score - a.score)
      .slice(0, 3)
      .map(({ c, score }) => {
        const photo = [...(c.car_photos || [])].sort((a, z) => a.sort_order - z.sort_order)[0];
        return {
          slug: c.slug,
          title: lang === 'en' && c.title_en ? c.title_en : c.title,
          year: c.year,
          tier: matchTier(score),
          cover: photo ? photoUrl(photo.path) : null,
        };
      });

    const { data: saved, error } = await db
      .from('find_car_requests')
      .insert({
        brand_id: model.brand.id,
        model_id: model.id,
        brand: model.brand.name,
        model: model.name,
        year_from: year,
        year_to: year,
        mileage_max: mileageMax,
        budget_min: budgetMin,
        budget_max: budgetMax,
        fuel: clean(b.fuel, 30),
        body_type: clean(b.bodyType, 30),
        color: clean(b.color, 30),
        region: clean(b.region, 30),
        notes: clean(b.notes, 500),
        estimated_search_low: range ? range.low : null,
        estimated_search_high: range ? range.high : null,
        pricing_confidence: confidence,
        match_count: matches.length,
        lang,
      })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({
      id: saved.id,
      brand: model.brand.name,
      model: model.name,
      year,
      mileageMax,
      budgetMin,
      budgetMax,
      notes: clean(b.notes, 500),
      range,
      confidence,
      updatedAt,
      matches,
    });
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
