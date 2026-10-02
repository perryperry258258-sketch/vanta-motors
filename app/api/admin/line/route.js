import { NextResponse } from 'next/server';
import { requireRole, UUID_RE } from '../../../../lib/supabaseAdmin';
import { push, text, confirmTemplate } from '../../../../lib/line';

export const dynamic = 'force-dynamic';

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `VANTA-${s}`;
}

export async function POST(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return fail('沒有權限', 403);
  const { db, user, profile } = ctx;
  const b = await req.json().catch(() => ({}));
  const actor = profile.display_name || '後台';

  try {
    // 產生合作車源的 LINE 綁定碼（只有管理員）
    if (b.action === 'bind_code') {
      if (profile.role !== 'admin') return fail('只有管理員可以操作', 403);
      if (!UUID_RE.test(String(b.partnerId || ''))) return fail('invalid');
      const code = randomCode();
      const { error } = await db.from('partners').update({ line_bind_code: code }).eq('id', b.partnerId);
      if (error) throw error;
      return NextResponse.json({ code });
    }

    if (!UUID_RE.test(String(b.caseId || ''))) return fail('invalid');
    const { data: c } = await db
      .from('cases')
      .select('*, customer:customers(name, line_user_id), partner:partners(name, line_user_id), car:cars(title)')
      .eq('id', b.caseId)
      .maybeSingle();
    if (!c) return fail('找不到案件', 404);
    const subject = c.subject || (c.car && c.car.title) || '';

    // 用 LINE 請客戶確認成交（按鈕直接回覆）
    if (b.action === 'send_confirmation') {
      if (!c.customer || !c.customer.line_user_id) return fail('這位客戶沒有連結 LINE');
      const { data: existing } = await db
        .from('customer_confirmations')
        .select('token, response, expires_at')
        .eq('case_id', c.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if ((existing || []).some((x) => x.response === 'confirmed')) return fail('客戶已經確認過成交');
      let row = (existing || []).find((x) => !x.response && new Date(x.expires_at) > new Date());
      if (!row) {
        const { data, error } = await db.from('customer_confirmations').insert({ case_id: c.id, created_by: user.id }).select('token').single();
        if (error) throw error;
        row = data;
      }
      await push(c.customer.line_user_id, [
        text('感謝您透過 VANTA MOTORS 找到愛車。\n\n為完成本次服務紀錄，請協助確認您的購車案件。'),
        confirmTemplate(c.case_no, subject, row.token),
      ]);
      await db.from('case_events').insert({
        case_id: c.id, type: 'line_push', body: '已透過 LINE 傳送成交確認給客戶', actor_id: user.id, actor_label: actor, visibility: 'internal',
      });
      return NextResponse.json({ ok: true });
    }

    // 用 LINE 通知車源負責人
    if (b.action === 'notify_partner') {
      if (!c.partner || !c.partner.line_user_id) return fail('這位車源還沒有綁定 LINE');
      const origin = new URL(req.url).origin;
      const message = String(b.message || '').slice(0, 3000);
      await push(c.partner.line_user_id, [text(`${message}\n\n查看案件：${origin}/partner/cases/${c.id}`)]);
      await db.from('case_events').insert({
        case_id: c.id, type: 'line_push', body: `已透過 LINE 通知 ${c.partner.name}`, actor_id: user.id, actor_label: actor, visibility: 'partner',
      });
      return NextResponse.json({ ok: true });
    }

    return fail('unknown action');
  } catch (e) {
    console.error(e);
    return fail(String(e.message || e).includes('LINE') ? 'LINE 傳送失敗，請確認對方沒有封鎖官方帳號' : '伺服器錯誤', 500);
  }
}
