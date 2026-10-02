import { createClient } from '@supabase/supabase-js';

// 只能在伺服器端使用（API 與伺服器頁面），絕對不要在 'use client' 檔案引用
export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const BUYBACK_BUCKET = 'buyback-photos';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 從請求的登入憑證確認對方是不是 Admin，是的話回傳 { db, user }
export async function requireAdmin(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const db = getAdminSupabase();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await db.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle();
  if (!profile || profile.role !== 'admin') return null;
  return { db, user: data.user };
}
