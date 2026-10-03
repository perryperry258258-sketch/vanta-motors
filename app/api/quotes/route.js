import { NextResponse } from 'next/server';
import { getAdminSupabase, UUID_RE } from '../../../lib/supabaseAdmin';
import { quoteCars } from '../../../lib/buyback/quote';

export const dynamic = 'force-dynamic';

// 在售車輛列表用：一次取得多台車的大概市場行情（只回傳上架中的車）
export async function POST(req) {
  const body = await req.json().catch(() => null);
  const ids = [...new Set(((body && body.ids) || []).map(String).filter((id) => UUID_RE.test(id)))].slice(0, 60);
  if (!ids.length) return NextResponse.json({ quotes: {} });
  try {
    const db = getAdminSupabase();
    const { data: cars } = await db
      .from('cars')
      .select('id, title, brand, model, year, mileage')
      .in('id', ids)
      .eq('status', 'published');
    const quotes = await quoteCars(db, cars || []);
    return NextResponse.json({ quotes });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ quotes: {} });
  }
}
