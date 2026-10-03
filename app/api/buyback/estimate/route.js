import { NextResponse } from 'next/server';
import { getAdminSupabase, UUID_RE } from '../../../../lib/supabaseAdmin';
import { taiwanYear, DEFAULT_SETTINGS } from '../../../../lib/buyback/engine';
import { valuate, publicValuation } from '../../../../lib/buyback/valuation';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const modelId = String((body && body.modelId) || '');
  const year = Number(body && body.year);
  const mileage = Math.round(Number(body && body.mileage));
  const lang = body && body.lang === 'en' ? 'en' : 'zh';
  const conditionKey = String((body && body.condition) || 'normal').slice(0, 40);
  const version = String((body && body.version) || '').slice(0, 120);
  if (!UUID_RE.test(modelId)) return fail('invalid model');

  try {
    const db = getAdminSupabase();
    const [modelRes, setRes] = await Promise.all([
      db.from('buyback_models')
        .select('id, name, active, brand:buyback_brands(id, name, brand_factor, active)')
        .eq('id', modelId)
        .maybeSingle(),
      db.from('buyback_settings').select('min_year').eq('id', 1).maybeSingle(),
    ]);

    const model = modelRes.data;
    if (!model || !model.active || !model.brand || !model.brand.active) return fail('model not found', 404);

    const minYear = (setRes.data && setRes.data.min_year) || DEFAULT_SETTINGS.min_year;
    const currentYear = taiwanYear();
    if (!Number.isInteger(year) || year < minYear || year > currentYear) return fail('invalid year');
    if (!Number.isFinite(mileage) || mileage < 0 || mileage > 1500000) return fail('invalid mileage');

    const v = await valuate(db, { brand: model.brand, model, year, mileage, version, conditionKey });

    const { data: saved, error } = await db
      .from('buyback_estimates')
      .insert({
        brand_id: model.brand.id,
        model_id: model.id,
        brand_name: model.brand.name,
        model_name: model.name,
        year,
        mileage,
        lang,
        ...v.log,
      })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({
      id: saved.id,
      brand: model.brand.name,
      model: model.name,
      year,
      mileage,
      version,
      low: v.ranges ? v.ranges.buyback.low : null,
      high: v.ranges ? v.ranges.buyback.high : null,
      market: v.ranges ? v.ranges.market : null,
      quality: v.quality,
      updatedAt: v.updatedAt,
      breakdown: v.breakdown,
      valuation: publicValuation(v),
      spreadLow: Number(v.settings.spread_low),
      spreadHigh: Number(v.settings.spread_high),
    });
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
