import { NextResponse } from 'next/server';
import { requireRole, UUID_RE } from '../../../../lib/supabaseAdmin';
import { push, text } from '../../../../lib/line';
import { addCaseEvent } from '../../../../lib/viewing';
import { GUARANTEE_RE } from '../../../../lib/questions';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 客服跟進客戶：用 LINE 傳跟進訊息（客服不可自行保證車況或價格）
export async function POST(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return fail('unauthorized', 401);
  const body = await req.json().catch(() => null);
  const caseId = String((body && body.caseId) || '');
  const message = String((body && body.text) || '').trim().slice(0, 2000);
  if (!UUID_RE.test(caseId)) return fail('invalid case');
  if (!message) return fail('請填寫訊息');
  if (GUARANTEE_RE.test(message)) return fail('訊息含有「保證」等字眼，請修改後再送出。');

  try {
    const { db, profile } = ctx;
    const { data: c } = await db.from('cases').select('id, customer:customers(line_user_id)').eq('id', caseId).maybeSingle();
    if (!c) return fail('not found', 404);
    if (!c.customer || !c.customer.line_user_id) return fail('這位客戶沒有連結 LINE');
    await push(c.customer.line_user_id, [text(message)]);
    // 已跟進：清除跟進日期，需要再跟進時重新設定
    await db.from('cases').update({ follow_up_at: null, unread: false }).eq('id', c.id);
    await addCaseEvent(db, c.id, `已用 LINE 跟進客戶：\n${message}`, { actor: profile.display_name || '客服' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return fail(e.message && e.message.startsWith('LINE') ? 'LINE 傳送失敗，請確認客戶是否封鎖官方帳號' : 'server error', 500);
  }
}
