import { NextResponse } from 'next/server';
import { getAdminSupabase, UUID_RE } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// 客人在車輛頁按「LINE 詢問」時記錄一筆網站詢問，後台可轉成案件
export async function POST(req) {
  const b = await req.json().catch(() => null);
  const carId = String((b && b.carId) || '');
  if (!UUID_RE.test(carId)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  try {
    const db = getAdminSupabase();
    const { data: car } = await db.from('cars').select('id, title, status').eq('id', carId).maybeSingle();
    if (!car || car.status !== 'published') return NextResponse.json({ error: 'not found' }, { status: 404 });
    await db.from('web_inquiries').insert({
      car_id: car.id,
      car_title: car.title,
      kind: 'line',
      lang: b.lang === 'en' ? 'en' : 'zh',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
