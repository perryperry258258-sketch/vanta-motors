import { NextResponse } from 'next/server';
import { requireRole, UUID_RE } from '../../../../lib/supabaseAdmin';
import { sendSlotsToCustomer, chooseSlot } from '../../../../lib/viewing';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 客服操作看車預約：重新傳送時間給客戶、代客戶確認時間（例如客戶用電話回覆）
export async function POST(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return fail('unauthorized', 401);
  const body = await req.json().catch(() => null);
  const action = String((body && body.action) || '');
  const actor = ctx.profile.display_name || '客服';

  try {
    if (action === 'resend') {
      const caseId = String(body.caseId || '');
      if (!UUID_RE.test(caseId)) return fail('invalid case');
      const r = await sendSlotsToCustomer(ctx.db, caseId, actor);
      return NextResponse.json(r);
    }
    if (action === 'choose') {
      const slotId = String(body.slotId || '');
      if (!UUID_RE.test(slotId)) return fail('invalid slot');
      const r = await chooseSlot(ctx.db, slotId, { via: 'staff', actor });
      if (!r) return fail('這個時間已經失效或已被選定');
      return NextResponse.json({ ok: true, when: r.when });
    }
    return fail('invalid action');
  } catch (e) {
    console.error(e);
    return fail(e.message && e.message.startsWith('LINE') ? 'LINE 傳送失敗，請確認客戶是否封鎖官方帳號' : 'server error', 500);
  }
}
