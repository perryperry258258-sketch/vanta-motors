'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase, photoUrl, BUCKET } from '../../../lib/supabase';

export default function DuplicatesPage() {
  return (
    <AdminShell adminOnly>
      <Duplicates />
    </AdminShell>
  );
}

const STATUS = { published: '上架', draft: '草稿', unlisted: '下架' };
const key = (c) => `${String(c.title || '').toLowerCase().replace(/\s+/g, '')}|${c.year || ''}|${c.mileage || ''}`;

// 重複車輛：車名、年份、里程都一樣的車放在同一組
// 預設每組保留「有案件、照片最多、最早上傳」的那台，其他勾選刪除
function Duplicates() {
  const [cars, setCars] = useState(null);
  const [withCase, setWithCase] = useState(new Set());
  const [marked, setMarked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data, error } = await getSupabase()
      .from('cars')
      .select('id, title, year, mileage, status, created_at, car_photos(path, sort_order)')
      .order('created_at')
      .limit(5000);
    if (error) return setError('讀取失敗：' + error.message);
    // 有案件的車優先保留（刪掉會讓案件失去車輛連結）
    const { data: cs } = await getSupabase().from('cases').select('car_id').not('car_id', 'is', null).limit(5000);
    setWithCase(new Set((cs || []).map((c) => c.car_id)));
    setCars(data);
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    (cars || []).forEach((c) => {
      const k = key(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    });
    return [...map.values()].filter((g) => g.length > 1);
  }, [cars]);

  // 預設勾選：每組除了要保留的那台以外
  useEffect(() => {
    const next = new Set();
    groups.forEach((g) => {
      const keep = [...g].sort(
        (a, b) =>
          Number(withCase.has(b.id)) - Number(withCase.has(a.id)) ||
          (b.car_photos || []).length - (a.car_photos || []).length ||
          a.created_at.localeCompare(b.created_at)
      )[0];
      g.forEach((c) => c.id !== keep.id && next.add(c.id));
    });
    setMarked(next);
  }, [groups, withCase]);

  function toggle(id) {
    const next = new Set(marked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setMarked(next);
  }

  async function removeMarked() {
    const ids = [...marked];
    if (!ids.length) return;
    // 每組至少要留一台
    const wipesGroup = groups.some((g) => g.every((c) => marked.has(c.id)));
    if (wipesGroup) return alert('有一組的車全部被勾選了，每組至少要保留一台。');
    if (!confirm(`刪除勾選的 ${ids.length} 台重複車輛（含照片）？刪除後無法復原。`)) return;
    setBusy(true);
    const sb = getSupabase();
    const failed = [];
    for (const id of ids) {
      const car = cars.find((c) => c.id === id);
      try {
        const paths = (car.car_photos || []).map((p) => p.path);
        const { error } = await sb.from('cars').delete().eq('id', id);
        if (error) throw error;
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      } catch (e) {
        failed.push(`${car.title}：${e.message}`);
      }
    }
    setMsg(failed.length ? `已刪除 ${ids.length - failed.length} 台；${failed.length} 台無法刪除：${failed.join('；')}` : `已刪除 ${ids.length} 台重複車輛。`);
    setBusy(false);
    load();
  }

  return (
    <>
      <h1>重複車輛</h1>
      <p className="admin-muted">
        車名、年份、里程都相同的車放在同一組。預設每組保留<strong>有案件、照片最多、最早上傳</strong>的那台，其他勾選刪除；可以自己改勾選。
        刪除有案件的車，案件會保留，但會失去車輛連結。
        之後批次上架會用照片指紋自動擋掉重複的車。
      </p>
      {error && <p className="admin-error">{error}</p>}
      {!cars && !error && <p className="admin-muted">檢查中…</p>}
      {cars && groups.length === 0 && <p className="result-box">沒有重複的車輛。</p>}
      {groups.length > 0 && (
        <div className="admin-card">
          <ul className="rank">
            <li><span>重複的組數</span><span>{groups.length} 組</span></li>
            <li><span>勾選刪除</span><span>{marked.size} 台</span></li>
          </ul>
          <div className="case-actions">
            <button className="btn btn-dark" onClick={removeMarked} disabled={busy || !marked.size}>{busy ? '刪除中…' : `刪除勾選的 ${marked.size} 台`}</button>
          </div>
          {msg && <p className="result-box">{msg}</p>}
        </div>
      )}
      {groups.map((g) => (
        <div className="admin-card" key={key(g[0])}>
          <h3>{g[0].title}</h3>
          <p className="admin-muted">年份 {g[0].year || '—'}｜里程 {g[0].mileage ? `${Number(g[0].mileage).toLocaleString()} 公里` : '—'}｜{g.length} 台</p>
          {g.map((c) => {
            const cover = [...(c.car_photos || [])].sort((a, b) => a.sort_order - b.sort_order)[0];
            return (
              <label key={c.id} className="car-row" style={{ opacity: marked.has(c.id) ? 0.5 : 1, cursor: 'pointer' }}>
                <div className="car-row-img">{cover && <img src={photoUrl(cover.path)} alt="" loading="lazy" />}</div>
                <div>
                  <p className="car-row-meta">
                    <input type="checkbox" style={{ width: 'auto', height: 'auto', margin: '0 8px 0 0' }} checked={marked.has(c.id)} onChange={() => toggle(c.id)} />
                    {marked.has(c.id) ? '刪除' : '保留'}｜{STATUS[c.status] || c.status}｜照片 {(c.car_photos || []).length} 張{withCase.has(c.id) ? '｜有案件' : ''}
                  </p>
                  <p className="car-row-meta">上傳 {new Date(c.created_at).toLocaleString('zh-TW', { hour12: false })}</p>
                  <Link href={`/admin/edit?id=${c.id}`} onClick={(e) => e.stopPropagation()}>查看</Link>
                </div>
              </label>
            );
          })}
        </div>
      ))}
    </>
  );
}
