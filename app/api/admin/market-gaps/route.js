import { NextResponse } from 'next/server';
import { requireRole } from '../../../../lib/supabaseAdmin';
import { matchBrand, matchModel } from '../../../../lib/buyback/matchModel';
import { quoteCars } from '../../../../lib/buyback/quote';
import { fetchAll } from '../../../../lib/fetchAll';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 行情缺漏檢查：列出算不出市場行情的車輛與原因
export async function GET(req) {
  const ctx = await requireRole(req, ['admin', 'staff']);
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { db } = ctx;
  const scope = new URL(req.url).searchParams.get('scope') === 'all' ? 'all' : 'published';

  try {
    const build = () => {
      let q = db.from('cars').select('id, title, brand, model, year, mileage, status, price, price_max').order('id');
      if (scope === 'published') q = q.eq('status', 'published');
      return q;
    };
    const [cars, { data: brands }] = await Promise.all([
      fetchAll(build),
      db.from('buyback_brands').select('id, name, active, buyback_models(id, name, active)').eq('active', true),
    ]);

    const quotes = await quoteCars(db, cars || []);
    const rows = (cars || []).map((c) => {
      const b = matchBrand(brands, c);
      const m = b ? matchModel(b.buyback_models, c) : null;
      let reason = 'ok';
      if (!c.year) reason = 'no_year';
      else if (!b) reason = 'brand';
      else if (!m) reason = 'model';
      else if (!quotes[c.id]) reason = 'no_price';
      else if (!quotes[c.id].publicOk) reason = quotes[c.id].hiddenReason === 'low_data' ? 'low_data' : 'hidden';
      return {
        id: c.id,
        title: c.title,
        brand: c.brand,
        model: c.model,
        year: c.year,
        status: c.status,
        matchedBrand: b ? b.name : null,
        matchedModel: m ? m.name : null,
        reason,
        market: quotes[c.id] ? quotes[c.id].market : null,
      };
    });
    return NextResponse.json({ rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
