'use client';

import { useState } from 'react';
import AdminShell, { useRole } from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { fetchAll } from '../../../lib/fetchAll';

export default function DataPage() {
  return (
    <AdminShell adminOnly>
      <h1>資料與個資</h1>
      <Backup />
      <PersonalData />
    </AdminShell>
  );
}

// 要備份的資料表（車輛照片檔案本身仍存在 Supabase，不在備份檔內）
const TABLES = [
  'cars', 'car_photos', 'car_conditions', 'vehicle_info_history',
  'customers', 'cases', 'case_events', 'web_inquiries', 'find_car_requests', 'find_notifications',
  'partners', 'dealers', 'partner_agreements', 'profiles',
  'viewing_slots', 'viewing_results', 'partner_questions',
  'sales', 'sale_costs', 'settlements', 'customer_confirmations',
  'buyback_estimates', 'buyback_leads', 'actual_purchases',
  'buyback_brands', 'buyback_models', 'historical_vehicle_prices', 'depreciation_rules', 'mileage_rules', 'model_factors', 'condition_factors', 'pricing_rules', 'buyback_settings',
  'crm_settings', 'cost_types',
];

// 一鍵備份：把所有資料匯出成一個 JSON 檔下載到手機
function Backup() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run() {
    setBusy(true);
    setMsg('');
    const sb = getSupabase();
    const out = { exported_at: new Date().toISOString(), site: 'vantamotors.tw', tables: {} };
    const skipped = [];
    let rows = 0;
    for (const t of TABLES) {
      setMsg(`備份中：${t}…`);
      try {
        const data = await fetchAll(() => sb.from(t).select('*').order('created_at', { ascending: true, nullsFirst: true }));
        out.tables[t] = data;
        rows += data.length;
      } catch {
        // 沒有 created_at 欄位的表改用不排序讀取
        try {
          const data = await fetchAll(() => sb.from(t).select('*'));
          out.tables[t] = data;
          rows += data.length;
        } catch (e) {
          skipped.push(t);
        }
      }
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VANTA_備份_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    await sb.from('crm_settings').update({ last_backup_at: new Date().toISOString() }).eq('id', 1);
    setMsg(`已下載備份：${Object.keys(out.tables).length} 個資料表、${rows.toLocaleString('en-US')} 筆資料（${(blob.size / 1024 / 1024).toFixed(1)} MB）。${skipped.length ? `略過：${skipped.join('、')}` : ''}`);
    setBusy(false);
  }

  return (
    <div className="admin-card">
      <h3>資料備份</h3>
      <p className="admin-muted">
        把車輛、案件、客戶、成交、結算、行情資料匯出成一個檔案存到手機，建議<strong>每週一次</strong>。超過 7 天沒備份，每日 LINE 提醒會提醒你。
        車輛照片本身不在備份檔內（照片仍存在網站的儲存空間）。
      </p>
      <p className="admin-muted">⚠️ 備份檔含客戶個資，請存在安全的地方（例如自己的雲端硬碟），不要傳給別人。</p>
      <div className="case-actions">
        <button className="btn btn-dark" onClick={run} disabled={busy}>{busy ? '備份中…' : '下載備份'}</button>
      </div>
      {msg && <p className="result-box">{msg}</p>}
    </div>
  );
}

// 客戶個資刪除：客人依個資法要求刪除時使用
function PersonalData() {
  const { session } = useRole();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function search() {
    const k = q.trim().replace(/[%_,()"]/g, ' ');
    if (k.length < 2) return setMsg('請輸入至少 2 個字（姓名、電話或 LINE 名稱）');
    setMsg('');
    const { data, error } = await getSupabase()
      .from('customers')
      .select('id, name, phone, line_name, deleted_at, created_at, cases(id, case_no)')
      .or(`name.ilike.%${k}%,phone.ilike.%${k}%,line_name.ilike.%${k}%`)
      .limit(20);
    if (error) return setMsg('搜尋失敗：' + error.message);
    setList(data || []);
  }

  async function remove(c) {
    const who = c.name || c.line_name || c.phone || '這位客戶';
    if (!confirm(`確定刪除「${who}」的個人資料？\n\n會清除：姓名、電話、Email、備註、LINE 綁定、客戶傳的訊息內容、賣車照片。\n成交與結算的金額紀錄會保留（不含個資）。\n\n刪除後無法復原，之後也無法再用 LINE 通知這位客戶。`)) return;
    setBusyId(c.id);
    setMsg('');
    try {
      const res = await fetch('/api/admin/customer-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ customerId: c.id }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || '刪除失敗');
      setMsg(out.failed.length
        ? `部分完成。已刪除：${out.done.join('、')}。未完成：${out.failed.join('；')}`
        : `已刪除「${who}」的個人資料（${out.done.join('、')}）。請回覆客人已完成處理。`);
      await search();
    } catch (e) {
      setMsg(e.message);
    }
    setBusyId(null);
  }

  return (
    <div className="admin-card">
      <h3>客戶個資刪除</h3>
      <p className="admin-muted">
        客人依個資法要求刪除資料時使用。會清除姓名、電話、LINE 綁定、客人傳的訊息內容、賣車照片；
        成交與結算的金額紀錄依法需要保留，只移除其中的個人資料。
      </p>
      <div className="add-row">
        <input placeholder="姓名、電話或 LINE 名稱" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn btn-dark btn-sm" onClick={search}>搜尋</button>
      </div>
      {list && list.length === 0 && <p className="admin-muted">找不到符合的客戶。</p>}
      {(list || []).map((c) => (
        <div className="question-done" key={c.id}>
          <p>
            <strong>{c.name || c.line_name || '未命名'}</strong>
            {c.phone ? `｜${c.phone}` : ''}
            {c.line_name && c.name ? `｜LINE：${c.line_name}` : ''}
          </p>
          <p className="admin-muted">
            案件 {(c.cases || []).length} 件{(c.cases || []).length ? `（${c.cases.map((x) => x.case_no).join('、')}）` : ''}
          </p>
          <div className="inline-actions">
            {c.deleted_at ? (
              <span className="admin-muted">已於 {new Date(c.deleted_at).toLocaleDateString('zh-TW')} 刪除個資</span>
            ) : (
              <button className="danger" disabled={busyId === c.id} onClick={() => remove(c)}>{busyId === c.id ? '刪除中…' : '刪除個資'}</button>
            )}
          </div>
        </div>
      ))}
      {msg && <p className="result-box">{msg}</p>}
    </div>
  );
        }
