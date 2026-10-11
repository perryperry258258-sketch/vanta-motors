import { NextResponse } from 'next/server';
import { requireRole } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const clean = (v, n = 60) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '').slice(0, n) || null;

// 只接受自己網站的頁面：完整網址（vantamotors.tw）或以 / 開頭的路徑
function toPath(input) {
  const s = String(input || '').trim();
  if (!s) return '/zh';
  if (s.startsWith('/')) return s.slice(0, 300);
  try {
    const u = new URL(s);
    if (!/(^|\.)vantamotors\.tw$/.test(u.hostname) && !u.hostname.endsWith('.vercel.app')) return null;
    return `${u.pathname}${u.search}`.slice(0, 300);
  } catch {
    return null;
  }
}

// 短網址管理（只有管理員）
export async function GET(req) {
  const ctx = await requireRole(req, ['admin']);
  if (!ctx) return fail('unauthorized', 401);
  const { data, error } = await ctx.db.from('short_links').select('*').order('created_at', { ascending: false });
  if (error) return fail(error.message, 500);
  return NextResponse.json({ links: data || [] });
}

export async function POST(req) {
  const ctx = await requireRole(req, ['admin']);
  if (!ctx) return fail('unauthorized', 401);
  const b = await req.json().catch(() => ({}));

  if (b.action === 'delete') {
    const { error } = await ctx.db.from('short_links').delete().eq('code', String(b.code || ''));
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  const code = String(b.code || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(code)) return fail('短網址代碼只能用英文小寫、數字和「-」，例如 ig、fb-ad、reels-10');
  const path = toPath(b.target);
  if (!path) return fail('目的頁面只能是 vantamotors.tw 網站裡的頁面');
  const row = {
    code,
    target_path: path,
    utm_source: clean(b.source),
    utm_medium: clean(b.medium),
    utm_campaign: clean(b.campaign, 80),
  };
  const { error } = await ctx.db.from('short_links').insert(row);
  if (error) return fail(error.code === '23505' ? `「${code}」已經用過了，請換一個代碼` : error.message, 400);
  return NextResponse.json({ ok: true });
}
