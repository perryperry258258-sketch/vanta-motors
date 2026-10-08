import { NextResponse } from 'next/server';
import { getAdminSupabase } from '../../../../lib/supabaseAdmin';
import { push, text } from '../../../../lib/line';
import { buildDigest } from '../../../../lib/digest';
import { sendViewingReminders } from '../../../../lib/viewing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel 排程每天早上 9 點（台灣時間）呼叫：把今日提醒用 LINE 傳給已綁定的管理員、客服
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getAdminSupabase();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  // 明天要看車的：提醒客戶和車源
  const reminders = await sendViewingReminders(db, origin);
  const digest = await buildDigest(db, origin);
  if (digest.empty) return NextResponse.json({ ok: true, sent: 0, reminders, reason: 'nothing to remind' });

  const { data: staff } = await db.from('profiles').select('user_id, line_user_id').in('role', ['admin', 'staff']).not('line_user_id', 'is', null);
  let sent = 0;
  for (const s of staff || []) {
    try {
      await push(s.line_user_id, [text(digest.text)]);
      sent += 1;
    } catch (e) {
      console.error('digest push failed', s.user_id, e);
    }
  }
  return NextResponse.json({ ok: true, sent, reminders, counts: digest.counts });
}
