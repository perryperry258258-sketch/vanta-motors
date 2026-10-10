// 找車需求自動配對：新上架的車符合客戶登記的找車條件，就用 LINE 通知客戶（每天早上排程）
import { push, text } from './line';
import { addCaseEvent } from './viewing';
import { matchScore } from './find';

const CLOSED = ['won', 'lost', 'cancelled'];
const MIN_SCORE = 70; // 品牌、車型都要對，年份、里程、預算大致符合
const MAX_PER_REQUEST = 3;

export async function sendFindMatches(db, origin) {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data: cars } = await db
    .from('cars')
    .select('id, slug, title, title_en, brand, model, year, mileage, price, price_max')
    .eq('status', 'published')
    .is('sold_at', null)
    .gte('created_at', since)
    .limit(500);
  if (!cars || !cars.length) return 0;

  // 60 天內、還在進行中的找車需求，而且客戶有連結 LINE
  const { data: reqs } = await db
    .from('find_car_requests')
    .select('id, brand, model, year_from, year_to, mileage_max, budget_min, budget_max, lang, case_id, status, customer:customers(line_user_id)')
    .gte('created_at', new Date(Date.now() - 60 * 864e5).toISOString())
    .not('status', 'in', `(${CLOSED.join(',')})`)
    .limit(1000);

  let sent = 0;
  for (const r of reqs || []) {
    const lineId = r.customer && r.customer.line_user_id;
    if (!lineId) continue;
    const hits = cars
      .map((c) => ({ c, score: matchScore(r, c) }))
      .filter((x) => x.score >= MIN_SCORE)
      .sort((a, z) => z.score - a.score)
      .slice(0, MAX_PER_REQUEST);
    const fresh = [];
    for (const { c } of hits) {
      // 同一台車只通知一次
      const { error } = await db.from('find_notifications').insert({ request_id: r.id, car_id: c.id });
      if (!error) fresh.push(c);
    }
    if (!fresh.length) continue;

    const en = r.lang === 'en';
    const lines = fresh.map((c) => {
      const title = en && c.title_en ? c.title_en : c.title;
      const km = c.mileage ? `${Number(c.mileage).toLocaleString('en-US')} km` : '';
      return `・${title}${km ? `｜${km}` : ''}\n${origin}/${en ? 'en' : 'zh'}/vehicles/${c.slug}`;
    });
    const msg = en
      ? `Good news! We found ${fresh.length > 1 ? 'vehicles' : 'a vehicle'} that may match what you're looking for 🚗\n\n${lines.join('\n\n')}\n\nReply here if you'd like to know more or book a viewing.`
      : `好消息！有${fresh.length > 1 ? '幾台' : '一台'}車可能符合您在找的條件 🚗\n\n${lines.join('\n\n')}\n\n想了解更多或預約看車，直接在這裡回覆我們就好。`;
    try {
      await push(lineId, [text(msg)]);
      sent += 1;
      if (r.case_id) await addCaseEvent(db, r.case_id, `系統自動通知客戶有符合的新車源：${fresh.map((c) => c.title).join('、')}`);
    } catch (e) {
      console.error('find match notify failed', r.id, e);
    }
  }
  return sent;
}
