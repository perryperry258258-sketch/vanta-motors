// 每日提醒內容：今天要跟進的案件、待回覆、尚未指派車源、成交資料不一致（伺服器端）
import { fetchAll } from './fetchAll';

const CLOSED = ['won', 'lost', 'cancelled'];
const taipeiDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);

export async function buildDigest(db, origin) {
  const today = taipeiDate();
  const endOfToday = new Date(`${today}T23:59:59+08:00`).toISOString();
  const open = await fetchAll(() =>
    db.from('cases')
      .select('id, case_no, subject, status, type, unread, partner_id, follow_up_at, follow_up_note, disputed_at')
      .not('status', 'in', `(${CLOSED.join(',')})`)
      .order('id')
  );
  const due = open.filter((c) => c.follow_up_at && c.follow_up_at <= endOfToday).sort((a, b) => a.follow_up_at.localeCompare(b.follow_up_at));
  const unread = open.filter((c) => c.unread).length;
  const unassigned = open.filter((c) => !c.partner_id && c.type !== 'sell').length;
  const disputed = open.filter((c) => c.disputed_at).length;
  const counts = { due: due.length, unread, unassigned, disputed };

  const [, m, d] = today.split('-');
  const lines = [`VANTA 今日提醒（${Number(m)}/${Number(d)}）`, ''];
  lines.push(`📌 今天要跟進：${due.length} 件`);
  due.slice(0, 10).forEach((c) => lines.push(`・${c.case_no} ${c.subject || '未指定車輛'}${c.follow_up_note ? `｜${c.follow_up_note}` : ''}`));
  if (due.length > 10) lines.push(`・…還有 ${due.length - 10} 件`);
  lines.push('', `💬 待回覆客戶：${unread} 件`, `🚗 尚未指派車源：${unassigned} 件`);
  if (disputed) lines.push(`⚠️ 成交資料不一致：${disputed} 件`);
  lines.push('', `${origin}/admin/cases`);
  return { text: lines.join('\n').slice(0, 4900), counts, empty: !due.length && !unread && !unassigned && !disputed };
}
