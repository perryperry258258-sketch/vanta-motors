import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 客戶回覆成交確認（只記錄是否成交，不收集任何個資或文件）
export async function POST(req) {
  const b = await req.json().catch(() => null);
  const token = String((b && b.token) || '');
  const response = b && b.response;
  if (!/^[0-9a-f]{64}$/.test(token) || !['confirmed', 'denied'].includes(response)) return fail('invalid');

  try {
    const db = getAdminSupabase();
    const { data: row } = await db
      .from('customer_confirmations')
      .select('id, response, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (!row) return fail('not found', 404);
    if (new Date(row.expires_at) < new Date()) return fail('expired', 410);
    if (row.response) return NextResponse.json({ ok: true, response: row.response });

    const { error } = await db
      .from('customer_confirmations')
      .update({ response, responded_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('response', null);
    if (error) throw error;
    return NextResponse.json({ ok: true, response });
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
