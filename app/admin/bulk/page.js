'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase, BUCKET } from '../../../lib/supabase';
import { compressImage } from '../../../lib/image';
import { makeSlug } from '../../../lib/parseTitle';
import { groupFiles } from '../../../lib/bulkParse';
import '../../../styles/viewing.css';

export default function BulkPage() {
  return (
    <AdminShell adminOnly>
      <Bulk />
    </AdminShell>
  );
}

const STATE = { ready: '待上傳', exists: '已存在', uploading: '上傳中', done: '完成', failed: '失敗', skipped: '略過' };

function Bulk() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [publish, setPublish] = useState(false);
  const [skipFirst, setSkipFirst] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const stopRef = useRef(false);

  useEffect(() => {
    getSupabase().from('partners').select('id, name, active').order('name').then(({ data }) => setPartners(data || []));
  }, []);

  async function pick(fileList) {
    const groups = groupFiles(Array.from(fileList || []));
    // 已經有同名車輛的，預設不重複上傳
    const { data: existing } = await getSupabase().from('cars').select('title').limit(5000);
    const titles = new Set((existing || []).map((c) => c.title.trim()));
    setRows(
      groups.map((g) => ({
        ...g,
        include: !titles.has(g.title),
        state: titles.has(g.title) ? 'exists' : 'ready',
        excluded: new Set(),
        cover: 0,
        error: '',
      }))
    );
  }

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.include && r.state !== 'done');
  const photoCount = useMemo(() => selected.reduce((n, r) => n + photosOf(r).length, 0), [rows, skipFirst]);

  function photosOf(r) {
    const list = r.files.filter((_, i) => !r.excluded.has(i) && !(skipFirst && i === 0));
    const coverFile = r.files[r.cover];
    if (coverFile && list.includes(coverFile)) return [coverFile, ...list.filter((f) => f !== coverFile)];
    return list;
  }

  async function uploadOne(r) {
    const sb = getSupabase();
    const photos = photosOf(r);
    if (!photos.length) throw new Error('沒有照片');
    const title = r.title.trim();
    const { data: car, error } = await sb
      .from('cars')
      .insert({
        title,
        title_en: r.titleEn.trim() || null,
        brand: r.brand || null,
        model: r.model || null,
        year: r.year ? Number(r.year) : null,
        color: r.color || null,
        mileage: r.mileage ? Number(r.mileage) : null,
        price: r.price ? Number(r.price) : null,
        status: publish ? 'published' : 'draft',
        source_owner_id: ownerId || null,
        slug: makeSlug(r.titleEn.trim() || title),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;

    const rowsToInsert = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        if (stopRef.current) throw new Error('已暫停，這台車沒有上傳，下次會重新上傳');
        update(r.key, { error: `照片 ${i + 1} / ${photos.length}` });
        const blob = await compressImage(photos[i]);
        const path = `${car.id}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        rowsToInsert.push({ car_id: car.id, path, sort_order: i });
      }
      const { error: phErr } = await sb.from('car_photos').insert(rowsToInsert);
      if (phErr) throw phErr;
    } catch (e) {
      // 中途失敗：把這台車和已上傳的照片刪掉，避免留下沒有照片的半成品，之後可以重新上傳
      if (rowsToInsert.length) await sb.storage.from(BUCKET).remove(rowsToInsert.map((x) => x.path));
      await sb.from('cars').delete().eq('id', car.id);
      throw e;
    }
    return car.id;
  }

  async function run() {
    if (!selected.length) return;
    const msg = `上傳 ${selected.length} 台車、${photoCount} 張照片，狀態為「${publish ? '直接上架' : '草稿'}」。上傳期間請不要關閉這個分頁。確定開始？`;
    if (!confirm(msg)) return;
    stopRef.current = false;
    setRunning(true);
    let done = 0;
    for (const r of selected) {
      if (stopRef.current) break;
      setProgress(`第 ${done + 1} / ${selected.length} 台：${r.title}`);
      update(r.key, { state: 'uploading', error: '' });
      try {
        const id = await uploadOne(r);
        update(r.key, { state: 'done', error: '', carId: id, include: false });
      } catch (e) {
        update(r.key, { state: 'failed', include: true, error: e.message || String(e) });
      }
      done++;
    }
    setProgress(stopRef.current ? '已暫停，可以再按開始繼續上傳剩下的車。' : '全部處理完成。');
    setRunning(false);
  }

  const setField = (r, k) => ({ value: r[k] ?? '', onChange: (e) => update(r.key, { [k]: e.target.value }), disabled: running || r.state === 'done' });

  return (
    <>
      <h1>批次上架</h1>
      <p className="admin-muted">
        請用<strong>電腦的 Chrome 或 Edge</strong> 開這一頁（手機無法選資料夾）。選擇整個「VANTA 車源」資料夾，系統會依「品牌資料夾／車輛資料夾／照片」自動整理每台車，
        從資料夾名稱讀出年份、車型、顏色、里程，從照片檔名讀出「開價」。上傳前可以逐台檢查、修改。
      </p>

      <label className="photo-add">
        ＋ 選擇「VANTA 車源」資料夾
        <input type="file" multiple webkitdirectory="" directory="" disabled={running} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      </label>

      {rows.length > 0 && (
        <>
          <div className="admin-card">
            <h3>上傳設定</h3>
            <div className="field-grid">
              <label className="field"><span>車源負責人（全部套用）</span>
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={running}>
                  <option value="">VANTA 自有／未指定</option>
                  {partners.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field"><span>上傳後狀態</span>
                <select value={publish ? 'p' : 'd'} onChange={(e) => setPublish(e.target.value === 'p')} disabled={running}>
                  <option value="d">草稿（建議，檢查後再上架）</option>
                  <option value="p">直接上架</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 8 }}>
              <input type="checkbox" style={{ width: 'auto', height: 'auto', margin: 0 }} checked={skipFirst} onChange={(e) => setSkipFirst(e.target.checked)} disabled={running} />
              每台車都略過第 1 張照片（如果第 1 張通常是行照）
            </label>
            <p className="notice" style={{ marginTop: 10 }}>
              ⚠️ 行照、身分證、看得清楚的車牌<strong>不要上傳到網站</strong>。可以點每台車的「檢查照片」把那張按 ✕ 排除。
            </p>
            <ul className="rank" style={{ marginTop: 8 }}>
              <li><span>找到的車輛</span><span>{rows.length} 台</span></li>
              <li><span>已存在（預設略過）</span><span>{rows.filter((r) => r.state === 'exists').length} 台</span></li>
              <li><span>這次要上傳</span><span>{selected.length} 台、{photoCount} 張照片</span></li>
              <li><span>已完成</span><span>{rows.filter((r) => r.state === 'done').length} 台</span></li>
            </ul>
            <div className="case-actions">
              {running ? (
                <button className="btn btn-light" onClick={() => { stopRef.current = true; }}>暫停</button>
              ) : (
                <button className="btn btn-dark" onClick={run} disabled={!selected.length}>開始上傳</button>
              )}
            </div>
            {progress && <p className="result-box">{progress}</p>}
          </div>

          {rows.map((r) => (
            <div className="case-card" key={r.key}>
              <div className="case-card-top">
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" style={{ width: 'auto', height: 'auto', margin: 0 }} checked={r.include} disabled={running || r.state === 'done'} onChange={(e) => update(r.key, { include: e.target.checked })} />
                  <span className="case-no">{r.brandFolder} / {r.carFolder}</span>
                </label>
                <span className={`badge badge-${r.state === 'done' ? 'ok' : r.state === 'failed' ? 'warn' : r.state === 'exists' ? 'off' : 'mid'}`}>{STATE[r.state]}</span>
              </div>
              <div className="field-grid">
                <label className="field"><span>車名</span><input {...setField(r, 'title')} /></label>
                <label className="field"><span>English Title</span><input {...setField(r, 'titleEn')} placeholder="車名已是英文可留空" /></label>
                <label className="field"><span>品牌</span><input {...setField(r, 'brand')} /></label>
                <label className="field"><span>車型</span><input {...setField(r, 'model')} /></label>
                <label className="field"><span>年份</span><input inputMode="numeric" {...setField(r, 'year')} /></label>
                <label className="field"><span>顏色</span><input {...setField(r, 'color')} /></label>
                <label className="field"><span>里程（公里）</span><input inputMode="numeric" {...setField(r, 'mileage')} /></label>
                <label className="field"><span>價格（萬）</span><input inputMode="decimal" {...setField(r, 'price')} /></label>
              </div>
              {r.notes.length > 0 && <p className="admin-error">{r.notes.join('；')}</p>}
              {r.error && <p className={r.state === 'failed' ? 'admin-error' : 'admin-muted'}>{r.error}</p>}
              <div className="inline-actions">
                <button onClick={() => setOpenKey(openKey === r.key ? null : r.key)}>
                  {openKey === r.key ? '收合照片' : `檢查照片（${photosOf(r).length} / ${r.files.length} 張）`}
                </button>
                {r.carId && <Link href={`/admin/edit?id=${r.carId}`}>編輯這台車</Link>}
              </div>
              {openKey === r.key && <Thumbs row={r} skipFirst={skipFirst} onChange={(patch) => update(r.key, patch)} disabled={running || r.state === 'done'} />}
            </div>
          ))}
        </>
      )}
    </>
  );
}

// 照片縮圖：點 ✕ 排除，點「封面」設為第一張
function Thumbs({ row, skipFirst, onChange, disabled }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const list = row.files.map((f) => URL.createObjectURL(f));
    setUrls(list);
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, [row.files]);

  function toggle(i) {
    const next = new Set(row.excluded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onChange({ excluded: next });
  }

  return (
    <div className="photo-grid">
      {urls.map((u, i) => {
        const off = row.excluded.has(i) || (skipFirst && i === 0);
        return (
          <div className="photo-item" key={u} style={{ opacity: off ? 0.3 : 1 }}>
            <img src={u} alt={`照片 ${i + 1}`} />
            <span className="photo-badge">{row.cover === i ? '封面' : i + 1}</span>
            <div className="photo-tools">
              <button type="button" onClick={() => onChange({ cover: i })} disabled={disabled || off}>封面</button>
              <button type="button" onClick={() => toggle(i)} disabled={disabled}>{row.excluded.has(i) ? '還原' : '✕'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
                }
