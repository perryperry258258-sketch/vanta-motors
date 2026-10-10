import { NextResponse } from 'next/server';
import { requireRole } from '../../../../lib/supabaseAdmin';
import { push, text, getQuota } from '../../../../lib/line';
import { buildDigest } from '../../../../lib/digest';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 管理員、客服的 LINE 通知設定：查看綁定狀態、產生綁定碼、傳測試提醒、解除綁定
export async function GET(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return fail('unauthorized', 401);
  const { data } = await ctx.db.from('profiles').select('line_user_id, line_bind_code').eq('user_id', ctx.user.id).maybeSingle();
  const quota = await getQuota();
  const digest = await buildDigest(ctx.db, new URL(req.url).origin, { quota });
  return NextResponse.json({ bound: !!(data && data.line_user_id), code: (data && data.line_bind_code) || null, preview: digest.text, quota });
}

export async function POST(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return fail('unauthorized', 401);
  const body = await req.json().catch(() => ({}));
  const { db, user } = ctx;

  if (body.action === 'code') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = `VANTA-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => chars[b % chars.length]).join('')}`;
    const { error } = await db.from('profiles').update({ line_bind_code: code }).eq('user_id', user.id);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ code });
  }

  if (body.action === 'test') {
    const { data } = await db.from('profiles').select('line_user_id').eq('user_id', user.id).maybeSingle();
    if (!data || !data.line_user_id) return fail('還沒有綁定 LINE');
    const digest = await buildDigest(db, new URL(req.url).origin, { quota: await getQuota() });
    try {
      await push(data.line_user_id, [text(digest.text)]);
    } catch (e) {
      return fail('LINE 傳送失敗，請確認有加 VANTA 官方帳號好友', 500);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'unbind') {
    await db.from('profiles').update({ line_user_id: null, line_bind_code: null }).eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  }

  return fail('invalid action');
}
