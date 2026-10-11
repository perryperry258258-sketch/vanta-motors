import { NextResponse } from 'next/server';
import { requireRole, UUID_RE } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// 依客戶要求刪除個資（只有管理員）：清除姓名、電話、LINE 綁定、訊息內容、照片；
// 成交、結算等交易紀錄依法需要保留，只移除其中的個人資料
export async function POST(req) {
  const ctx = await requireRole(req, ['admin']);
  if (!ctx) return fail('unauthorized', 401);
  const body = await req.json().catch(() => ({}));
  const id = String(body.customerId || '');
  if (!UUID_RE.test(id)) return fail('invalid customer');
  const { db } = ctx;

  const { data: cu } = await db.from('customers').select('id, line_user_id, deleted_at').eq('id', id).maybeSingle();
  if (!cu) return fail('找不到這位客戶', 404);
  if (cu.deleted_at) return fail('這位客戶的個資已經刪除過了');

  const done = [];
  const failed = [];
  const step = async (label, fn) => {
    try {
      await fn();
      done.push(label);
    } catch (e) {
      console.error('customer delete step failed', label, e);
      failed.push(`${label}：${e.message || e}`);
    }
  };
  const check = ({ error }) => {
    if (error) throw error;
  };

  const { data: cases } = await db.from('cases').select('id, buyback_lead_id').eq('customer_id', id);
  const caseIds = (cases || []).map((c) => c.id);
  const leadIds = (cases || []).map((c) => c.buyback_lead_id).filter(Boolean);

  if (caseIds.length) {
    await step('案件中的客戶需求文字', async () =>
      check(await db.from('cases').update({ customer_request: '［已依客戶要求刪除個資］' }).in('id', caseIds)));
    await step('客戶傳送的 LINE 訊息內容', async () =>
      check(await db.from('case_events').update({ body: '［客戶訊息已依要求刪除］' }).in('case_id', caseIds).eq('type', 'customer_msg')));
  }

  if (leadIds.length) {
    await step('賣車估價的聯絡資料與照片', async () => {
      const { data: leads } = await db.from('buyback_leads').select('id, photo_paths').in('id', leadIds);
      const paths = (leads || []).flatMap((l) => l.photo_paths || []);
      if (paths.length) await db.storage.from('buyback-photos').remove(paths);
      check(await db.from('buyback_leads').update({ name: null, phone: null, line_id: null, condition_note: null, photo_paths: [] }).in('id', leadIds));
    });
  }

  await step('找車需求的備註', async () =>
    check(await db.from('find_car_requests').update({ notes: null }).eq('customer_id', id)));

  if (cu.line_user_id) {
    await step('LINE 原始訊息紀錄', async () => check(await db.from('line_events').delete().eq('line_user_id', cu.line_user_id)));
  }

  await step('客戶基本資料（姓名、電話、Email、備註、LINE）', async () =>
    check(await db.from('customers').update({ name: null, phone: null, email: null, notes: null, line_name: '已刪除客戶', line_user_id: null, deleted_at: new Date().toISOString() }).eq('id', id)));

  await step('客戶資料的變更紀錄', async () =>
    check(await db.from('audit_log').delete().eq('table_name', 'customers').eq('row_id', id)));

  return NextResponse.json({ ok: failed.length === 0, done, failed, cases: caseIds.length });
}
