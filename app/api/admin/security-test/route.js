import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 權限安全測試：建立兩個臨時車源與一個臨時客服帳號，
// 用他們真正的登入身分去嘗試讀取／修改不屬於自己的資料，測完全部刪除。
// 只有管理員可以執行。
export async function POST(req) {
  const ctx = await requireAdmin(req);
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = ctx.db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const origin = new URL(req.url).origin;
  const tag = `SECTEST-${Date.now().toString(36).toUpperCase()}`;
  const password = `T!${crypto.randomUUID()}`;
  const made = { users: [], partners: [], cars: [], cases: [], customers: [], sales: [], costs: [] };
  const results = [];

  const record = (no, name, pass, detail = '') => results.push({ no, name, pass, detail });
  const asUser = async (email) => {
    const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`登入測試帳號失敗：${error.message}`);
    return { client: c, token: data.session.access_token };
  };
  const callApi = async (path, token, body) => {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body || {}),
    });
    return res.status;
  };
  const blocked = (r) => !!r.error || !r.data || (Array.isArray(r.data) && r.data.length === 0);
  // 401（未登入）與 403（沒有權限）都代表伺服器拒絕
  const refused = (s) => s === 401 || s === 403;

  try {
    // ===== 建立測試資料 =====
    const { data: partners, error: pErr } = await db
      .from('partners')
      .insert([{ name: `${tag}-A` }, { name: `${tag}-B` }])
      .select('id, name');
    if (pErr) throw new Error(`建立測試車源失敗：${pErr.message}`);
    made.partners.push(...partners.map((p) => p.id));
    const [pa, pb] = partners;

    const accounts = [
      ['a', 'partner', pa.id],
      ['b', 'partner', pb.id],
      ['s', 'staff', null],
    ];
    const emails = {};
    for (const [k, role, partnerId] of accounts) {
      const email = `${tag.toLowerCase()}-${k}@example.com`;
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(`建立測試帳號失敗：${error.message}`);
      made.users.push(data.user.id);
      const { error: e2 } = await db.from('profiles').insert({ user_id: data.user.id, role, partner_id: partnerId, display_name: `${tag}-${k}` });
      if (e2) throw new Error(`建立測試帳號權限失敗：${e2.message}`);
      emails[k] = email;
    }

    const { data: cust } = await db.from('customers').insert({ name: `${tag} 客戶`, phone: '0900000000' }).select('id').single();
    made.customers.push(cust.id);
    const { data: carB, error: cErr } = await db
      .from('cars')
      .insert({ title: `${tag} 車源B的車`, slug: `${tag.toLowerCase()}-b`, status: 'draft', source_owner_id: pb.id })
      .select('id')
      .single();
    if (cErr) throw new Error(`建立測試車輛失敗：${cErr.message}`);
    made.cars.push(carB.id);
    const { data: caseB, error: caseErr } = await db
      .from('cases')
      .insert({ type: 'buy', status: 'transferred', source: 'other', customer_id: cust.id, car_id: carB.id, partner_id: pb.id, subject: `${tag} 車源B的案件` })
      .select('id')
      .single();
    if (caseErr) throw new Error(`建立測試案件失敗：${caseErr.message}`);
    made.cases.push(caseB.id);
    const { data: saleB, error: sErr } = await db
      .from('sales')
      .insert({ case_id: caseB.id, partner_id: pb.id, sale_price: 500000, partner_status: 'reported', reported_at: new Date().toISOString() })
      .select('id')
      .single();
    if (sErr) throw new Error(`建立測試成交失敗：${sErr.message}`);
    made.sales.push(saleB.id);
    const { data: type } = await db.from('cost_types').select('id, name, category').limit(1).single();
    const { data: costB, error: costErr } = await db
      .from('sale_costs')
      .insert({ sale_id: saleB.id, partner_id: pb.id, category: type.category, cost_type_id: type.id, cost_type_name: type.name, amount: 12345, approval: 'approved', approved_at: new Date().toISOString() })
      .select('id')
      .single();
    if (costErr) throw new Error(`建立測試成本失敗：${costErr.message}`);
    made.costs.push(costB.id);

    const A = await asUser(emails.a);
    const S = await asUser(emails.s);
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });

    // ===== 1. 車源 A 查看車源 B 的車輛 =====
    let r = await A.client.from('cars').select('id').eq('id', carB.id);
    const r1b = await A.client.from('car_conditions').select('car_id').eq('car_id', carB.id);
    const r1c = await A.client.from('vehicle_info_history').select('id').eq('car_id', carB.id);
    record(1, '車源 A 查看車源 B 的車輛（含車況、修改紀錄）', blocked(r) && blocked(r1b) && blocked(r1c));

    // ===== 2. 車源 A 查看車源 B 的案件 =====
    r = await A.client.from('cases').select('id').eq('id', caseB.id);
    const r2b = await A.client.from('case_events').select('id').eq('case_id', caseB.id);
    const r2c = await A.client.from('customers').select('id').eq('id', cust.id);
    const api2 = await callApi('/api/partner/case', A.token, { caseId: caseB.id, action: 'accept' });
    record(2, '車源 A 查看／操作車源 B 的案件與客戶資料', blocked(r) && blocked(r2b) && blocked(r2c) && api2 === 404, `API 回應 ${api2}`);

    // ===== 3. 車源 A 查看車源 B 的成本 =====
    r = await A.client.from('sale_costs').select('id').eq('id', costB.id);
    const r3b = await A.client.from('sales').select('id').eq('id', saleB.id);
    record(3, '車源 A 查看車源 B 的成交與成本', blocked(r) && blocked(r3b));

    // ===== 4. 車源 A 修改 partner_id（搶別人的車、冒用別人身分新增車輛）=====
    await A.client.from('cars').update({ source_owner_id: pa.id }).eq('id', carB.id);
    const { data: carAfter } = await db.from('cars').select('source_owner_id').eq('id', carB.id).single();
    const fake = await A.client.from('cars').insert({ title: `${tag} 冒用`, slug: `${tag.toLowerCase()}-fake`, status: 'draft', source_owner_id: pb.id }).select('id');
    if (fake.data && fake.data[0]) made.cars.push(fake.data[0].id);
    const selfPublish = await A.client.from('cars').insert({ title: `${tag} 自行上架`, slug: `${tag.toLowerCase()}-pub`, status: 'published', source_owner_id: pa.id }).select('id');
    if (selfPublish.data && selfPublish.data[0]) made.cars.push(selfPublish.data[0].id);
    record(4, '車源 A 修改 partner_id／冒用其他車源／自行上架', carAfter.source_owner_id === pb.id && !!fake.error && !!selfPublish.error);

    // ===== 5. 車源 A 修改 case_id =====
    await A.client.from('cases').update({ partner_id: pa.id }).eq('id', caseB.id);
    const { data: caseAfter } = await db.from('cases').select('partner_id').eq('id', caseB.id).single();
    const api5 = await callApi('/api/partner/case', A.token, { caseId: caseB.id, action: 'propose', slots: [new Date(Date.now() + 864e5).toISOString()] });
    record(5, '車源 A 把別人的案件改成自己的／對別人案件提供看車時間', caseAfter.partner_id === pb.id && api5 === 404, `API 回應 ${api5}`);

    // ===== 6. 車源 A 修改成交、成本、結算 =====
    await A.client.from('sales').update({ sale_price: 1 }).eq('id', saleB.id);
    await A.client.from('sale_costs').update({ amount: 1 }).eq('id', costB.id);
    const delCost = await A.client.rpc('partner_delete_cost', { p_cost: costB.id });
    const { data: saleAfter } = await db.from('sales').select('sale_price').eq('id', saleB.id).single();
    const { data: costAfter } = await db.from('sale_costs').select('amount').eq('id', costB.id).maybeSingle();
    // 車源 A 沒有任何結算，讀到任何一筆都代表外洩
    const r6 = await A.client.from('settlements').select('id').limit(5);
    record(6, '車源 A 修改別人的成交價、成本、結算', saleAfter.sale_price === 500000 && costAfter && costAfter.amount === 12345 && !!delCost.error && blocked(r6));

    // ===== 7. 客服取得成本 =====
    r = await S.client.from('sale_costs').select('id, amount').limit(5);
    record(7, '客服查看成本明細', blocked(r));

    // ===== 8. 客服取得利潤 =====
    r = await S.client.from('settlements').select('id, gross_profit, vanta_share').limit(5);
    const r8b = await S.client.from('sales').select('id, sale_price').limit(5);
    const r8c = await S.client.from('partner_agreements').select('id, vanta_share').limit(5);
    record(8, '客服查看成交價、利潤、分潤比例', blocked(r) && blocked(r8b) && blocked(r8c));

    // ===== 9. 未登入直接呼叫 =====
    const anonTables = ['cases', 'customers', 'sale_costs', 'settlements', 'car_conditions'];
    const anonChecks = await Promise.all([
      ...anonTables.map((t) => anon.from(t).select('*').limit(1)),
      anon.from('cars').select('id').eq('id', carB.id),
    ]);
    const leakedTables = [...anonTables, '未上架車輛'].filter((_, i) => !blocked(anonChecks[i]));
    const apiNames = ['partner/case', 'admin/questions', 'admin/viewing', 'admin/followup', 'admin/line', 'admin/security-test'];
    const apiStatuses = await Promise.all([
      callApi('/api/partner/case', null, { caseId: caseB.id, action: 'accept' }),
      callApi('/api/admin/questions', null, { action: 'create', caseId: caseB.id }),
      callApi('/api/admin/viewing', null, { action: 'resend', caseId: caseB.id }),
      callApi('/api/admin/followup', null, { caseId: caseB.id, text: 'x' }),
      callApi('/api/admin/line', null, { action: 'send_confirmation', caseId: caseB.id }),
      callApi('/api/admin/security-test', null, {}),
    ]);
    const openApis = apiNames.filter((_, i) => !refused(apiStatuses[i]));
    record(
      9,
      '未登入直接讀資料庫、呼叫後台 API',
      leakedTables.length === 0 && openApis.length === 0,
      `資料庫：${leakedTables.length ? `讀得到 ${leakedTables.join('、')}` : '6 項全部擋下'}｜API：${openApis.length ? `未擋下 ${openApis.join('、')}` : `全部擋下（${apiStatuses.join('、')}）`}`
    );

    // ===== 10. 客戶查看其他案件 =====
    const confirmPage = await fetch(`${origin}/confirm/${crypto.randomUUID()}`);
    const confirmApi = await fetch(`${origin}/api/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: crypto.randomUUID(), response: 'confirmed' }),
    });
    const pageText = await confirmPage.text();
    const leaked = pageText.includes(tag);
    record(10, '客戶用猜的確認連結查看別人的案件', !leaked && confirmApi.status >= 400, `確認頁 ${confirmPage.status}、確認 API ${confirmApi.status}`);

    // 額外：車源 A 讀不到別人的協議、別人的協議文件
    // 車源 A 沒有任何協議，讀到任何一筆都代表外洩
    r = await A.client.from('partner_agreements').select('id').limit(5);
    const docs = await A.client.storage.from('partner-docs').list(pb.id);
    record(11, '車源 A 查看其他車源的合作協議與文件', blocked(r) && blocked(docs));
  } catch (e) {
    record(0, '測試執行中斷', false, e.message || String(e));
  } finally {
    // ===== 清除所有測試資料 =====
    const cleanup = [];
    const del = async (table, col, ids) => {
      if (!ids.length) return;
      const { error } = await db.from(table).delete().in(col, ids);
      if (error) cleanup.push(`${table}：${error.message}`);
    };
    await del('sale_costs', 'id', made.costs);
    await del('settlements', 'sale_id', made.sales);
    await del('customer_confirmations', 'case_id', made.cases);
    await del('sales', 'id', made.sales);
    await del('cases', 'id', made.cases);
    await del('cars', 'id', made.cars);
    await del('customers', 'id', made.customers);
    await del('profiles', 'user_id', made.users);
    for (const id of made.users) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) cleanup.push(`帳號：${error.message}`);
    }
    await del('partners', 'id', made.partners);
    if (cleanup.length) results.push({ no: 99, name: '清除測試資料', pass: false, detail: cleanup.join('；') });
  }

  return NextResponse.json({ tag, results, passed: results.filter((x) => x.pass).length, total: results.length });
}
