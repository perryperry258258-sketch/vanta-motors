import { NextResponse } from 'next/server';
import { getAdminSupabase, UUID_RE } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const clean = (v, max) => String(v || '').trim().slice(0, max) || null;

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || !UUID_RE.test(String(b.leadId || '')) || !UUID_RE.test(String(b.estimateId || ''))) {
    return fail('invalid request');
  }

  try {
    const db = getAdminSupabase();
    const { data: est } = await db.from('buyback_estimates').select('*').eq('id', b.estimateId).maybeSingle();
    if (!est) return fail('estimate not found', 404);
    if (Date.now() - new Date(est.created_at).getTime() > 7 * 24 * 3600 * 1000) return fail('estimate expired');

    const photos = Array.isArray(b.photoPaths)
      ? b.photoPaths.filter((p) => typeof p === 'string' && p.startsWith(`${b.leadId}/`)).slice(0, 20)
      : [];
    const contact = {
      name: clean(b.name, 60),
      phone: clean(b.phone, 30),
      line_id: clean(b.lineId, 60),
    };
    const now = new Date().toISOString();

    const { data: existing } = await db
      .from('buyback_leads')
      .select('id, estimate_id, photo_paths, line_clicks, name, phone, line_id')
      .eq('id', b.leadId)
      .maybeSingle();

    if (existing) {
      if (existing.estimate_id !== est.id) return fail('mismatch');
      const { error } = await db
        .from('buyback_leads')
        .update({
          name: contact.name || existing.name,
          phone: contact.phone || existing.phone,
          line_id: contact.line_id || existing.line_id,
          photo_paths: [...new Set([...(existing.photo_paths || []), ...photos])],
          line_clicks: (existing.line_clicks || 0) + 1,
          last_clicked_at: now,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('buyback_leads').insert({
        id: b.leadId,
        estimate_id: est.id,
        ...contact,
        brand_name: est.brand_name,
        model_name: est.model_name,
        year: est.year,
        mileage: est.mileage,
        estimated_low: est.estimated_low,
        estimated_high: est.estimated_high,
        photo_paths: photos,
        source: 'line',
        line_clicks: 1,
        last_clicked_at: now,
      });
      if (error) throw error;
    }

    await db.from('buyback_line_clicks').insert({ lead_id: b.leadId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
