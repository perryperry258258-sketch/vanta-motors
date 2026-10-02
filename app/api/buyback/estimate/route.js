import { NextResponse } from 'next/server';
import { getAdminSupabase, UUID_RE } from '../../../../lib/supabaseAdmin';
import { runEstimate, taiwanYear, DEFAULT_SETTINGS, findModelFactor, findCondition } from '../../../../lib/buyback/engine';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const modelId = String((body && body.modelId) || '');
  const year = Number(body && body.year);
  const mileage = Math.round(Number(body && body.mileage));
  const lang = body && body.lang === 'en' ? 'en' : 'zh';
  const conditionKey = String((body && body.condition) || 'normal').slice(0, 40);
  if (!UUID_RE.test(modelId)) return fail('invalid model');

  try {
    const db = getAdminSupabase();
    const [modelRes, rulesRes, depRes, kmRes, setRes, condRes] = await Promise.all([
      db.from('buyback_models')
        .select('id, name, active, brand:buyback_brands(id, name, brand_factor, active)')
        .eq('id', modelId)
        .maybeSingle(),
      db.from('pricing_rules').select('*').eq('model_id', modelId).eq('active', true),
      db.from('depreciation_rules').select('*').eq('active', true),
      db.from('mileage_rules').select('*').eq('active', true),
      db.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
      db.from('condition_factors').select('*'),
    ]);

    const model = modelRes.data;
    if (!model || !model.active || !model.brand || !model.brand.active) return fail('model not found', 404);

    const settings = { ...DEFAULT_SETTINGS, ...(setRes.data || {}) };
    const currentYear = taiwanYear();
    if (!Number.isInteger(year) || year < settings.min_year || year > currentYear) return fail('invalid year');
    if (!Number.isFinite(mileage) || mileage < 0 || mileage > 1500000) return fail('invalid mileage');

    const { data: modelFactorRows } = await db.from('model_factors').select('model, factor').eq('brand_id', model.brand.id);

    const result = runEstimate({
      rules: rulesRes.data || [],
      brand: model.brand,
      year,
      mileage,
      depreciation: depRes.data || [],
      mileageRules: kmRes.data || [],
      settings,
      currentYear,
      modelFactor: findModelFactor(modelFactorRows, model.name),
      condition: findCondition(condRes.data, conditionKey),
    });

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
        ...result.log,
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
      low: result.low,
      high: result.high,
      quality: result.quality,
      updatedAt: result.updatedAt,
      breakdown: result.breakdown,
      spreadLow: Number(settings.spread_low),
      spreadHigh: Number(settings.spread_high),
    });
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
