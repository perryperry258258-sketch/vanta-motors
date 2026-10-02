import { NextResponse } from 'next/server';
import { requireAdmin, UUID_RE } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 建立員工或合作車源的登入帳號（只有 Admin 可以呼叫）
export async function POST(req) {
  const ctx = await requireAdmin(req);
  if (!ctx) return fail('只有管理員可以建立帳號', 403);

  const b = await req.json().catch(() => null);
  const email = String((b && b.email) || '').trim().toLowerCase();
  const password = String((b && b.password) || '');
  const role = b && b.role;
  const partnerId = b && b.partnerId ? String(b.partnerId) : null;
  const displayName = String((b && b.displayName) || '').trim().slice(0, 60) || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email 格式不正確');
  if (password.length < 8) return fail('密碼至少 8 個字元');
  if (!['admin', 'staff', 'partner'].includes(role)) return fail('角色不正確');
  if (role === 'partner' && (!partnerId || !UUID_RE.test(partnerId))) return fail('合作車源帳號需要指定車源');

  const { db } = ctx;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return fail(error.message.includes('already') ? '這個 Email 已經有帳號' : error.message);

  const { error: pErr } = await db.from('profiles').insert({
    user_id: data.user.id,
    role,
    email,
    display_name: displayName,
    partner_id: role === 'partner' ? partnerId : null,
  });
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id);
    return fail(pErr.message, 500);
  }
  return NextResponse.json({ ok: true });
}

// 停用帳號：刪除登入帳號（權限資料會一起刪除）
export async function DELETE(req) {
  const ctx = await requireAdmin(req);
  if (!ctx) return fail('只有管理員可以停用帳號', 403);
  const b = await req.json().catch(() => null);
  const userId = String((b && b.userId) || '');
  if (!UUID_RE.test(userId)) return fail('invalid');
  if (userId === ctx.user.id) return fail('不能停用自己的帳號');
  const { error } = await ctx.db.auth.admin.deleteUser(userId);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}
