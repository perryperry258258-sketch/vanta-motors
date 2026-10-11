import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../../../lib/supabaseAdmin';
import { SOURCE_COOKIE, SOURCE_DAYS } from '../../../lib/source';

export const dynamic = 'force-dynamic';

// 短網址：vantamotors.tw/go/ig → 導到設定好的頁面，並記錄來源（IG、FB…）與點擊次數
export async function GET(req, { params }) {
  const { code } = await params;
  const origin = new URL(req.url).origin;
  const key = String(code || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!key) return NextResponse.redirect(`${origin}/`, 302);

  const db = getAdminSupabase();
  const { data: link } = await db.from('short_links').select('*').eq('code', key).maybeSingle();
  if (!link) return NextResponse.redirect(`${origin}/`, 302);

  db.from('short_links').update({ clicks: (link.clicks || 0) + 1, last_clicked_at: new Date().toISOString() }).eq('code', key).then(() => {}, () => {});

  const target = new URL(link.target_path || '/zh', origin);
  if (link.utm_source) target.searchParams.set('utm_source', link.utm_source);
  if (link.utm_medium) target.searchParams.set('utm_medium', link.utm_medium);
  if (link.utm_campaign) target.searchParams.set('utm_campaign', link.utm_campaign);

  const res = NextResponse.redirect(target.toString(), 302);
  // 直接記錄來源（不用等網頁判斷）
  if (link.utm_source) {
    const value = encodeURIComponent(JSON.stringify({ source: link.utm_source, medium: link.utm_medium, campaign: link.utm_campaign, at: new Date().toISOString() }));
    res.cookies.set(SOURCE_COOKIE, value, { path: '/', maxAge: SOURCE_DAYS * 86400, sameSite: 'lax' });
  }
  return res;
}
