// 成交確認：車源回報成交後，自動用 LINE 請客戶確認（伺服器端）
import { push, text, confirmTemplate } from './line';
import { addCaseEvent } from './viewing';

export async function sendSaleConfirmation(db, caseId, { actor, createdBy }) {
  const { data: c } = await db
    .from('cases')
    .select('id, case_no, subject, customer:customers(line_user_id), car:cars(title)')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return { sent: false, reason: 'case not found' };

  const lineId = c.customer && c.customer.line_user_id;
  if (!lineId) {
    await addCaseEvent(db, c.id, '車源已回報成交，客戶沒有連結 LINE，請人工請客戶確認是否已成交', { actor });
    await db.from('cases').update({ unread: true }).eq('id', c.id);
    return { sent: false, reason: '客戶沒有連結 LINE，VANTA 會另外請客戶確認' };
  }

  const { data: existing } = await db
    .from('customer_confirmations')
    .select('token, response, expires_at')
    .eq('case_id', c.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if ((existing || []).some((x) => x.response === 'confirmed')) return { sent: false, reason: '客戶已經確認過成交' };
  let row = (existing || []).find((x) => !x.response && new Date(x.expires_at) > new Date());
  if (!row) {
    const { data, error } = await db.from('customer_confirmations').insert({ case_id: c.id, created_by: createdBy || null }).select('token').single();
    if (error) throw error;
    row = data;
  }
  await push(lineId, [
    text('感謝您透過 VANTA MOTORS 找到愛車！\n\n為了協助我們確認案件服務紀錄，想請您協助確認以下案件目前的交易狀態。\n\n此確認主要用於 VANTA 的服務紀錄及案件管理，不取代您與實際車輛提供者簽署的買賣契約或其他交易文件。'),
    confirmTemplate(c.case_no, c.subject || (c.car && c.car.title) || '', row.token),
  ]);
  await addCaseEvent(db, c.id, '車源回報成交，系統已自動用 LINE 請客戶確認成交', { actor });
  return { sent: true };
}
