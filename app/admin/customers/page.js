'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { SOURCES, SOURCE_LABEL } from '../../../lib/case';

export default function CustomersPage() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="admin-muted">載入中…</p>}>
        <Customers />
      </Suspense>
    </AdminShell>
  );
}

const EMPTY = { name: '', phone: '', email: '', line_name: '', source: 'line', notes: '' };

function Customers() {
  const focusId = useSearchParams().get('id');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await getSupabase()
      .from('customers')
      .select('*, cases(id, status)')
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (error) return setError('讀取失敗：' + error.message);
    setList(data);
    if (focusId) {
      const found = data.find((c) => c.id === focusId);
      if (found) startEdit(found);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (list || []).filter(
      (c) => !k || [c.name, c.phone, c.line_name, c.email].filter(Boolean).join(' ').toLowerCase().includes(k)
    );
  }, [list, q]);

  function startEdit(c) {
    setEditing(c ? { id: c.id, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] || ''])) } : { id: null, ...EMPTY });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    const row = {};
    Object.keys(EMPTY).forEach((k) => { row[k] = String(editing[k] || '').trim() || null; });
    row.source = editing.source || 'other';
    if (!row.name && !row.phone && !row.line_name) return alert('請至少填寫稱呼、電話或 LINE 名稱');
    row.updated_at = new Date().toISOString();
    setBusy(true);
    const sb = getSupabase();
    const { error } = editing.id
      ? await sb.from('customers').update(row).eq('id', editing.id)
      : await sb.from('customers').insert(row);
    setBusy(false);
    if (error) return alert('儲存失敗：' + error.message);
    setEditing(null);
    load();
  }

  const set = (k) => ({ value: editing[k], onChange: (e) => setEditing({ ...editing, [k]: e.target.value }) });

  return (
    <>
      <div className="admin-row-head">
        <h1>客戶</h1>
        <button className="btn btn-dark btn-sm" onClick={() => startEdit(null)}>＋ 新增客戶</button>
      </div>

      {editing && (
        <div className="admin-form">
          <h3>{editing.id ? '編輯客戶' : '新增客戶'}</h3>
          <div className="field-grid">
            <label className="field"><span>稱呼</span><input {...set('name')} /></label>
            <label className="field"><span>電話</span><input inputMode="tel" {...set('phone')} /></label>
            <label className="field"><span>LINE 名稱</span><input {...set('line_name')} /></label>
            <label className="field"><span>Email</span><input type="email" {...set('email')} /></label>
          </div>
          <label className="field"><span>來源</span>
            <select {...set('source')}>
              {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>備註</span><textarea {...set('notes')} /></label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setEditing(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      )}

      <input className="admin-search" style={{ marginTop: 14 }} type="search" placeholder="搜尋姓名、電話、LINE 名稱" value={q} onChange={(e) => setQ(e.target.value)} />

      {error && <p className="admin-error">{error}</p>}
      {!list && !error && <p className="admin-muted">載入中…</p>}
      {list && filtered.length === 0 && <p className="admin-muted">沒有符合的客戶。</p>}

      {filtered.map((c) => (
        <div className="case-card" key={c.id}>
          <div className="case-card-top">
            <span className="case-no">{SOURCE_LABEL[c.source] || c.source}</span>
            <span className="badge badge-mid">案件 {(c.cases || []).length}</span>
          </div>
          <h3>{c.name || c.line_name || '未命名'}</h3>
          <p className="lead-meta">
            {[c.phone, c.line_name && `LINE：${c.line_name}`, c.email].filter(Boolean).join('｜') || '沒有聯絡資料'}
            {c.notes && <><br />{c.notes}</>}
          </p>
          <div className="inline-actions">
            <button onClick={() => startEdit(c)}>編輯</button>
            <Link href={`/admin/cases?customer=${c.id}`}>查看案件</Link>
          </div>
        </div>
      ))}
    </>
  );
}
