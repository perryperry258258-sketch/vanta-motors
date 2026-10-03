import { NextResponse } from 'next/server';
import { requireRole, UUID_RE } from '../../../../lib/supabaseAdmin';
import { validateSlots, sendSlotsToCustomer, addCaseEvent, fmtSlot } from '../../../../lib/viewing';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const CLOSED = ['won', 'lost', 'cancelled'];

// 車源操作案件：接受、無法配合、提供看車時間、回覆車況
// 一律在伺服器確認「這個案件指派給這位車源」，前端傳來的 partner_id 不採用
export async function POST(req) {
  const ctx = await requireRole(req, ['partner']);
  if (!ctx || !ctx.profile.partner_id) return fail('unauthorized', 401);
  const body = await req.json().catch(() => null);
  const caseId = String((body && body.caseId) || '');
  const action = String((body && body.action) || '');
  if (!UUID_RE.test(caseId)) return fail('invalid case');

  const { db, profile } = ctx;
  const { data: c } = await db
    .from('cases')
    .select('id, case_no, status, partner_id, partner_response')
    .eq('id', caseId)
    .maybeSingle();
  // 不是自己的案件一律回「找不到」，不透露案件是否存在
  if (!c || c.partner_id !== profile.partner_id) return fail('not found', 404);
  if (CLOSED.includes(c.status)) return fail('案件已結束');

  const { data: partner } = await db.from('partners').select('name').eq('id', profile.partner_id).maybeSingle();
  const actor = `${(partner && partner.name) || profile.display_name || '車源'}（車源）`;
  const now = new Date().toISOString();

  try {
    if (action === 'accept') {
      await db.from('cases').update({ partner_response: 'accepted', partner_responded_at: now }).eq('id', c.id);
      await addCaseEvent(db, c.id, '車源已接受案件，待安排看車', { visibility: 'partner', actor });
      return NextResponse.json({ ok: true });
    }

    if (action === 'decline') {
      const reason = String((body && body.note) || '').trim().slice(0, 300);
      await db
        .from('cases')
        .update({ partner_response: 'declined', partner_responded_at: now, status: 'in_progress', unread: true })
        .eq('id', c.id);
      await addCaseEvent(db, c.id, `車源無法配合${reason ? `：${reason}` : ''}`, { visibility: 'partner', actor });
      return NextResponse.json({ ok: true });
    }

    if (action === 'propose') {
      if (c.partner_response === 'pending' || c.partner_response === 'declined') return fail('請先接受案件');
      const v = validateSlots(body && body.slots);
      if (v.error) return fail(v.error);

      await db.from('viewing_slots').update({ status: 'cancelled' }).eq('case_id', c.id).eq('status', 'proposed');
      const { error } = await db
        .from('viewing_slots')
        .insert(v.slots.map((slot_at) => ({ case_id: c.id, partner_id: profile.partner_id, slot_at, created_by: ctx.user.id })));
      if (error) throw error;
      await addCaseEvent(db, c.id, `車源提供看車時間：${v.slots.map(fmtSlot).join('、')}，等待客戶確認`, { visibility: 'partner', actor });

      const sent = await sendSlotsToCustomer(db, c.id, 'VANTA 系統');
      return NextResponse.json({ ok: true, sent: sent.sent, reason: sent.reason || null });
    }

    if (action === 'answer') {
      const questionId = String((body && body.questionId) || '');
      const answer = String((body && body.answer) || '').trim().slice(0, 1000);
      if (!UUID_RE.test(questionId)) return fail('invalid question');
      if (!answer) return fail('請填寫回覆內容');
      // 只能回覆自己案件的問題；回覆送出後不可修改，保留原始紀錄
      const { data: q } = await db
        .from('partner_questions')
        .update({ status: 'answered', answer, answered_at: now, answered_by: ctx.user.id, answered_by_label: actor })
        .eq('id', questionId)
        .eq('case_id', c.id)
        .eq('partner_id', profile.partner_id)
        .eq('status', 'open')
        .select('question, topic')
        .maybeSingle();
      if (!q) return fail('這個問題已經回覆過或已取消');
      await addCaseEvent(db, c.id, `車源回覆車況：\n問：${q.question}\n答：${answer}`, { visibility: 'partner', actor });
      await db.from('cases').update({ unread: true }).eq('id', c.id);
      return NextResponse.json({ ok: true });
    }

    return fail('invalid action');
  } catch (e) {
    console.error(e);
    return fail('server error', 500);
  }
}
