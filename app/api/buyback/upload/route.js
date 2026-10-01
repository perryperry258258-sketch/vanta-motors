import { NextResponse } from 'next/server';
import { getAdminSupabase, BUYBACK_BUCKET, UUID_RE } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || !UUID_RE.test(String(b.leadId || '')) || !UUID_RE.test(String(b.estimateId || ''))) {
    return fail('invalid request');
  }

  try {
    const db = getAdminSupabase();
    const { data: est } = await db.from('buyback_estimates').select('id, created_at').eq('id', b.estimateId).maybeSingle();
    if (!est) return fail('estimate not found', 404);
    if (Date.now() - new Date(est.created_at).getTime() > 24 * 3600 * 1000) return fail('estimate expired');

    const { data: existing } = await db.storage.from(BUYBACK_BUCKET).list(b.leadId, { limit: 100 });
    if (existing && existing.length >= 14) return fail('too many photos', 429);

    const path = `${b.leadId}/${crypto.randomUUID()}.jpg`;
    const { data, error } = await db.storage.from(BUYBACK_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return NextResponse.json({ path: data.path, token: data.token });
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
