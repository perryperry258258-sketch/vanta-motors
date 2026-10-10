// 每日提醒內容：今天要跟進的案件、待回覆、尚未指派車源、成交資料不一致（伺服器端）
import { fetchAll } from './fetchAll';

const CLOSED = ['won', 'lost', 'cancelled'];
const taipeiDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);

// extra：{ nudges: { pending, noSlots }, quota: { limit, used, ratio } }（排程傳入，預覽時可省略）
export async function buildDigest(db, origin, extra = {}) {
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

  // 業務逾時（已自動用 LINE 提醒業務）
  const nudges = extra.nudges || { pending: [], noSlots: [] };
  const who = (x) => `・${x.case_no} ${x.subject || ''}${x.partner ? `｜${x.partner}` : ''}`;
  if (nudges.pending.length) {
    lines.push('', `⏰ 指派超過 24 小時未接案：${nudges.pending.length} 件（已提醒業務，可考慮改派）`);
    nudges.pending.slice(0, 8).forEach((x) => lines.push(who(x)));
  }
  if (nudges.noSlots.length) {
    lines.push('', `📅 接案超過 2 天未給看車時間：${nudges.noSlots.length} 件（已提醒業務）`);
    nudges.noSlots.slice(0, 8).forEach((x) => lines.push(who(x)));
  }

  // LINE 訊息用量
  const q = extra.quota;
  const quotaWarn = q && q.limit && q.ratio >= 0.8;
  if (q && q.limit) {
    lines.push('', `${quotaWarn ? '⚠️ ' : '📨 '}LINE 本月訊息：已用 ${q.used.toLocaleString('en-US')}／${q.limit.toLocaleString('en-US')} 則（${Math.round(q.ratio * 100)}%）`);
    if (q.ratio >= 1) lines.push('額度已用完，客人選看車時間、業務通知、成交確認都傳不出去，請到 LINE 官方帳號後台升級方案。');
    else if (quotaWarn) lines.push('快用完了，用完後通知會傳不出去，建議到 LINE 官方帳號後台確認方案。');
  }

  lines.push('', `${origin}/admin/cases`);
  const empty = !due.length && !unread && !unassigned && !disputed && !nudges.pending.length && !nudges.noSlots.length && !quotaWarn;
  return { text: lines.join('\n').slice(0, 4900), counts, empty };
}
