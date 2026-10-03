import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// 某品牌＋車型＋年份在歷史新車價資料庫中的版本清單（給前台版本選單用）
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const brand = String(p.get('brand') || '').slice(0, 60);
  const model = String(p.get('model') || '').slice(0, 80);
  const year = Number(p.get('year'));
  if (!brand || !model || !Number.isInteger(year)) return NextResponse.json({ versions: [] });
  try {
    const { data } = await getAdminSupabase()
      .from('historical_vehicle_prices')
      .select('version, reference_price')
      .eq('brand', brand)
      .eq('model', model)
      .eq('year', year)
      .neq('version', '')
      .order('reference_price')
      .limit(60);
    const versions = [...new Set((data || []).map((r) => r.version))];
    return NextResponse.json({ versions });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ versions: [] });
  }
}
