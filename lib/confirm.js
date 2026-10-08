// 成交確認：車源回報成交後，自動用 LINE 請客戶確認（伺服器端）
import { push, text, confirmTemplate } from './line';
import { addCaseEvent } from './viewing';

// 客戶回覆後的訊息（LINE 與確認頁共用的語氣）
export const CONFIRMED_REPLY = '恭喜您迎接新車 🎉\n\n謝謝您讓 VANTA MOTORS 陪您完成這次找車，祝您行車平安、用車愉快！\n\n之後不論是保養問題、想換車或賣車，或是身邊朋友在找車，都歡迎隨時在這裡找我們。';
export const DENIED_REPLY = '收到，謝謝您告訴我們。\n\n如果還在考慮，或有任何想再確認的地方，隨時在這裡跟我們說，我們會繼續陪您找到合適的車。';
export const CONFIRM_REQUEST =
  '恭喜您！聽說您已經找到喜歡的車了 🎉\n\n想跟您確認一下這次的交易狀態，方便我們完成服務紀錄，只要按下方按鈕就好。\n\n（此確認僅用於 VANTA 的服務紀錄及案件管理，不取代您與實際車輛提供者簽署的買賣契約或其他交易文件。）';

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
    text(CONFIRM_REQUEST),
    confirmTemplate(c.case_no, c.subject || (c.car && c.car.title) || '', row.token),
  ]);
  await addCaseEvent(db, c.id, '車源回報成交，系統已自動用 LINE 請客戶確認成交', { actor });
  return { sent: true };
}
