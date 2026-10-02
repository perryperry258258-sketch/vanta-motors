'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { STATUS_LABEL, shortDate } from '../../../lib/case';
import { FIND_STATUS_LABEL } from '../../../lib/find';

export default function CleanupPage() {
  return (
    <AdminShell adminOnly>
      <Cleanup />
    </AdminShell>
  );
}

// 每一種資料：怎麼讀、怎麼顯示、刪除時要提醒什麼
const KINDS = {
  cases: {
    label: '案件',
    table: 'cases',
    select: 'id, case_no, subject, status, created_at, customer:customers(name, line_name), car:cars(title)',
    title: (r) => `${r.case_no || ''}　${r.subject || (r.car && r.car.title) || '未指定車輛'}`,
    meta: (r) => `${STATUS_LABEL[r.status] || r.status}｜客戶：${(r.customer && (r.customer.name || r.customer.line_name)) || '—'}`,
    warn: '案件的 Timeline、成交資料、成本、結算、客戶確認會一起刪除。',
  },
  customers: {
    label: '客戶',
    table: 'customers',
    select: 'id, name, line_name, phone, created_at, cases(id)',
    title: (r) => r.name || r.line_name || '未命名',
    meta: (r) => `${r.phone || '沒有電話'}｜案件 ${(r.cases || []).length} 件`,
    warn: '客戶的案件不會被刪除，只會變成「尚未建立客戶資料」。',
  },
  find: {
    label: '找車需求',
    table: 'find_car_requests',
    select: 'id, brand, model, year_from, status, created_at',
    title: (r) => `${r.year_from ? `${r.year_from} ` : ''}${r.brand} ${r.model}`,
    meta: (r) => FIND_STATUS_LABEL[r.status] || r.status,
    warn: '只刪除找車需求紀錄，已經建立的案件不受影響。',
  },
  leads: {
    label: '收車線索',
    table: 'buyback_leads',
    select: 'id, year, brand_name, model_name, mileage, name, photo_paths, created_at',
    title: (r) => `${r.year || ''} ${r.brand_name || ''} ${r.model_name || ''}`,
    meta: (r) => `${Number(r.mileage || 0).toLocaleString('en-US')} km｜${r.name || '未留姓名'}｜照片 ${(r.photo_paths || []).length} 張`,
    warn: '線索、上傳的照片和 LINE 點擊紀錄會一起刪除，已經建立的收車案件會保留。',
  },
};

function Cleanup() {
  const [kind, setKind] = useState('cases');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const k = KINDS[kind];

  async function load() {
    setRows(null);
    setPicked(new Set());
    const { data, error } = await getSupabase()
      .from(k.table)
      .select(k.select)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) return setError('讀取失敗：' + error.message);
    setError('');
    setRows(data);
  }

  useEffect(() => {
    load();
  }, [kind]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((r) => !s || `${k.title(r)} ${k.meta(r)}`.toLowerCase().includes(s));
  }, [rows, q, kind]);

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allPicked = list.length > 0 && list.every((r) => picked.has(r.id));

  function toggleAll() {
    setPicked(allPicked ? new Set() : new Set(list.map((r) => r.id)));
  }

  async function remove() {
    const ids = [...picked];
    if (!ids.length) return;
    if (!confirm(`確定刪除 ${ids.length} 筆${k.label}？\n\n${k.warn}\n\n刪除後無法復原。`)) return;
    setBusy(true);
    const sb = getSupabase();
    try {
      if (kind === 'leads') {
        const paths = (rows || []).filter((r) => picked.has(r.id)).flatMap((r) => r.photo_paths || []);
        for (let i = 0; i < paths.length; i += 100) {
          await sb.storage.from('buyback-photos').remove(paths.slice(i, i + 100));
        }
      }
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await sb.from(k.table).delete().in('id', ids.slice(i, i + 100));
        if (error) throw error;
      }
      await load();
    } catch (e) {
      alert('刪除失敗：' + (e.message || e));
    }
    setBusy(false);
  }

  return (
    <>
      <h1>刪除資料</h1>
      <p className="admin-muted">用來清掉測試資料。勾選要刪除的項目，再按下方的刪除按鈕。只有管理員可以使用，刪除紀錄會留在變更紀錄裡。</p>

      <div className="tabs">
        {Object.entries(KINDS).map(([key, v]) => (
          <button key={key} aria-pressed={kind === key} onClick={() => { setKind(key); setQ(''); }}>{v.label}</button>
        ))}
      </div>

      <input className="admin-search" type="search" placeholder={`搜尋${k.label}`} value={q} onChange={(e) => setQ(e.target.value)} />

      {error && <p className="admin-error">{error}</p>}
      {!rows && !error && <p className="admin-muted">載入中…</p>}
      {rows && list.length === 0 && <p className="admin-muted">沒有資料。</p>}

      {list.length > 0 && (
        <div className="inline-actions" style={{ marginBottom: 12 }}>
          <button onClick={toggleAll}>{allPicked ? '取消全選' : `全選這 ${list.length} 筆`}</button>
        </div>
      )}

      {list.map((r) => (
        <label className="case-card" key={r.id} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={picked.has(r.id)}
            onChange={() => toggle(r.id)}
            style={{ width: 22, height: 22, marginTop: 2, flex: '0 0 auto' }}
          />
          <span style={{ display: 'block' }}>
            <strong style={{ display: 'block', fontSize: 17, fontWeight: 500 }}>{k.title(r)}</strong>
            <span className="lead-meta" style={{ display: 'block' }}>{shortDate(r.created_at)}｜{k.meta(r)}</span>
          </span>
        </label>
      ))}

      {picked.size > 0 && (
        <div className="save-bar">
          <div className="save-bar-inner">
            <button className="btn btn-light" onClick={() => setPicked(new Set())} disabled={busy}>取消</button>
            <button className="btn btn-dark" style={{ background: '#a12d2d', borderColor: '#a12d2d' }} onClick={remove} disabled={busy}>
              {busy ? '刪除中…' : `刪除 ${picked.size} 筆`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
