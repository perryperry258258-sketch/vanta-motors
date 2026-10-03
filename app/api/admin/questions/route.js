import { NextResponse } from 'next/server';
import { requireRole, UUID_RE } from '../../../../lib/supabaseAdmin';
import { push, text } from '../../../../lib/line';
import { addCaseEvent } from '../../../../lib/viewing';
import { TOPIC_LABEL, HOLD_REPLY, GUARANTEE_RE } from '../../../../lib/questions';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 客服操作車況確認：建立問題（請車源確認）、把車源回覆傳給客戶、取消
export async function POST(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return fail('unauthorized', 401);
  const { db, user, profile } = ctx;
  const body = await req.json().catch(() => null);
  const action = String((body && body.action) || '');
  const actor = profile.display_name || '客服';
  const origin = new URL(req.url).origin;

  try {
    if (action === 'create') {
      const caseId = String(body.caseId || '');
      const topic = String(body.topic || 'other');
      const question = String(body.question || '').trim().slice(0, 500);
      if (!UUID_RE.test(caseId)) return fail('invalid case');
      if (!TOPIC_LABEL[topic]) return fail('invalid topic');
      if (!question) return fail('請填寫客戶的問題');

      const { data: c } = await db
        .from('cases')
        .select('id, case_no, subject, partner_id, partner:partners(line_user_id), customer:customers(line_user_id)')
        .eq('id', caseId)
        .maybeSingle();
      if (!c) return fail('not found', 404);
      if (!c.partner_id) return fail('請先指定車源負責人');

      const { data: q, error } = await db
        .from('partner_questions')
        .insert({ case_id: c.id, partner_id: c.partner_id, topic, question, created_by: user.id, created_by_label: actor })
        .select('id')
        .single();
      if (error) throw error;
      await addCaseEvent(db, c.id, `請車源確認（${TOPIC_LABEL[topic]}）：${question}`, { visibility: 'partner', actor });

      const notes = [];
      if (c.partner && c.partner.line_user_id) {
        try {
          await push(c.partner.line_user_id, [
            text(`VANTA 車況確認\n\n案件編號：${c.case_no}\n車輛：${c.subject || '未指定車輛'}\n項目：${TOPIC_LABEL[topic]}\n客戶問題：${question}\n\n請到合作夥伴頁面回覆：\n${origin}/partner/cases/${c.id}`),
          ]);
          notes.push('已用 LINE 通知車源');
        } catch (e) {
          notes.push('LINE 通知車源失敗，請另外告知');
        }
      } else {
        notes.push('車源沒有綁定 LINE，請另外告知車源回覆');
      }

      // 先用標準話術回覆客戶「我幫您確認」，不自行回答車況
      if (body.holdReply && c.customer && c.customer.line_user_id) {
        try {
          await push(c.customer.line_user_id, [text(HOLD_REPLY)]);
          await addCaseEvent(db, c.id, `已回覆客戶：${HOLD_REPLY.split('\n')[0]}`, { actor });
          await db.from('cases').update({ unread: false }).eq('id', c.id);
          notes.push('已用 LINE 告訴客戶正在確認');
        } catch (e) {
          notes.push('LINE 回覆客戶失敗');
        }
      }
      return NextResponse.json({ ok: true, id: q.id, note: notes.join('，') });
    }

    if (action === 'send') {
      const questionId = String(body.questionId || '');
      const message = String(body.text || '').trim().slice(0, 2000);
      if (!UUID_RE.test(questionId)) return fail('invalid question');
      if (!message) return fail('請填寫回覆內容');
      // 客服不可自行保證車況
      if (GUARANTEE_RE.test(message)) return fail('回覆內容含有「保證」等字眼。車況請以車源提供的資訊轉達，並保留責任說明。');

      const { data: q } = await db
        .from('partner_questions')
        .select('id, status, case_id, answer, case:cases(id, customer:customers(line_user_id))')
        .eq('id', questionId)
        .maybeSingle();
      if (!q) return fail('not found', 404);
      if (q.status !== 'answered') return fail('車源還沒回覆，或已經回覆過客戶');

      const lineId = q.case && q.case.customer && q.case.customer.line_user_id;
      let sent = false;
      if (lineId && body.viaLine !== false) {
        await push(lineId, [text(message)]);
        sent = true;
      }
      await db
        .from('partner_questions')
        .update({ status: 'sent', sent_at: new Date().toISOString(), sent_text: message, sent_by_label: actor, sent_via: sent ? 'line' : 'manual' })
        .eq('id', q.id);
      await db.from('cases').update({ unread: false }).eq('id', q.case_id);
      await addCaseEvent(db, q.case_id, `${sent ? '已用 LINE 回覆客戶' : '已透過其他管道回覆客戶'}：\n${message}`, { actor });
      return NextResponse.json({ ok: true, sent });
    }

    if (action === 'cancel') {
      const questionId = String(body.questionId || '');
      if (!UUID_RE.test(questionId)) return fail('invalid question');
      const { data: q } = await db
        .from('partner_questions')
        .update({ status: 'cancelled' })
        .eq('id', questionId)
        .eq('status', 'open')
        .select('case_id, question')
        .maybeSingle();
      if (!q) return fail('只能取消還沒回覆的問題');
      await addCaseEvent(db, q.case_id, `取消車況確認：${q.question}`, { visibility: 'partner', actor });
      return NextResponse.json({ ok: true });
    }

    return fail('invalid action');
  } catch (e) {
    console.error(e);
    return fail(e.message && e.message.startsWith('LINE') ? 'LINE 傳送失敗，請確認客戶是否封鎖官方帳號' : 'server error', 500);
  }
}
