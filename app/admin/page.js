'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../components/admin/AdminShell';
import { getSupabase, photoUrl, BUCKET } from '../../lib/supabase';

const STATUS_LABEL = { published: '已上架', draft: '草稿', unlisted: '已下架' };
const TABS = [['all', '全部'], ['review', '車源送審'], ['published', '已上架'], ['draft', '草稿'], ['unlisted', '已下架']];
const SORTS = [['new', '最新'], ['views', '瀏覽最多'], ['inquiries', 'LINE 詢問最多']];

export default function AdminPage() {
  return (
    <AdminShell>
      <CarList />
    </AdminShell>
  );
}

function normalize(car) {
  const s = Array.isArray(car.car_stats) ? car.car_stats[0] : car.car_stats;
  return {
    ...car,
    stats: {
      views: (s && s.views) || 0,
      line: (s && s.line_clicks) || 0,
    },
  };
}

const inReview = (c) => c.review_status === 'pending' && c.status !== 'published';

function CarList() {
  const [cars, setCars] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('new');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    const { data, error } = await getSupabase()
      .from('cars')
      .select('id, slug, title, year, status, review_status, review_note, created_at, sold_at, partner:partners(name), car_photos(path, sort_order), car_stats(views, line_clicks)')
      .order('created_at', { ascending: false })
      .order('sort_order', { referencedTable: 'car_photos' })
      .limit(1, { referencedTable: 'car_photos' })
      .range(0, 1999);
    if (error) setError('讀取車輛失敗：' + error.message);
    else setCars(data.map(normalize));
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, review: 0, published: 0, draft: 0, unlisted: 0 };
    (cars || []).forEach((x) => {
      c.all++;
      c[x.status]++;
      if (inReview(x)) c.review++;
    });
    return c;
  }, [cars]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const filtered = (cars || []).filter(
      (c) =>
        (tab === 'all' || (tab === 'review' ? inReview(c) : c.status === tab)) &&
        (!k || [c.title, c.partner && c.partner.name].filter(Boolean).join(' ').toLowerCase().includes(k))
    );
    if (sort === 'views') return [...filtered].sort((a, b) => b.stats.views - a.stats.views);
    if (sort === 'inquiries') return [...filtered].sort((a, b) => b.stats.line - a.stats.line);
    return filtered;
  }, [cars, q, tab, sort]);

  async function patch(car, values) {
    setBusyId(car.id);
    const { error } = await getSupabase()
      .from('cars')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', car.id);
    setBusyId(null);
    if (error) return alert('更新失敗：' + error.message);
    load();
  }

  function approve(car) {
    patch(car, { status: 'published', review_status: null, review_note: null });
  }

  function reject(car) {
    const note = prompt('退回原因（車源會看到），例如：照片有拍到車牌、請補內裝照片', '');
    if (note === null) return;
    patch(car, { status: 'draft', review_status: 'rejected', review_note: note.trim() || null });
  }

  async function remove(car) {
    if (!confirm(`確定要刪除「${car.title}」嗎？照片會一起刪除，無法復原。`)) return;
    setBusyId(car.id);
    const supabase = getSupabase();
    const { data: photos } = await supabase.from('car_photos').select('path').eq('car_id', car.id);
    if (photos && photos.length) {
      await supabase.storage.from(BUCKET).remove(photos.map((p) => p.path));
    }
    const { error } = await supabase.from('cars').delete().eq('id', car.id);
    setBusyId(null);
    if (error) return alert('刪除失敗：' + error.message);
    setCars((prev) => prev.filter((c) => c.id !== car.id));
  }

  return (
    <>
      <div className="admin-row-head">
        <h1>車輛管理</h1>
        <Link href="/admin/edit" className="btn btn-dark btn-sm">＋ 新增車輛</Link>
      </div>

      <input className="admin-search" type="search" placeholder="搜尋車名或車源" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label} {counts[k]}
          </button>
        ))}
      </div>

      <div className="tabs" style={{ marginTop: -4 }}>
        {SORTS.map(([k, label]) => (
          <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'review' && <p className="admin-muted">合作車源送來的車輛。請確認照片（車牌、畫質）與文字後再上架。</p>}

      {error && <p className="admin-error">{error}</p>}
      {cars === null && !error && <p className="admin-muted">載入中…</p>}
      {cars && list.length === 0 && (
        <p className="admin-muted">
          {cars.length === 0 ? '還沒有車輛，按「＋ 新增車輛」開始。' : '沒有符合的車輛。'}
        </p>
      )}

      {list.length > 0 && (
        <div className="car-rows">
          {list.map((car) => {
            const p = car.car_photos && car.car_photos[0];
            const busy = busyId === car.id;
            return (
              <div className="car-row" key={car.id}>
                <div className="car-row-img">
                  {p && <img src={photoUrl(p.path)} alt="" loading="lazy" />}
                </div>
                <div>
                  <h3>{car.title}</h3>
                  <p className="car-row-meta">
                    {car.year || '年份未填'}
                    <span className={`status status-${car.status}`}>{STATUS_LABEL[car.status]}</span>
                    {inReview(car) && <span className="status status-unlisted">待審核</span>}
                    {car.sold_at && <span className="status status-unlisted">已售出</span>}
                  </p>
                  <p className="car-row-meta">
                    {car.partner ? `車源：${car.partner.name}｜` : ''}瀏覽 {car.stats.views}　LINE {car.stats.line}
                  </p>
                  <div className="car-row-actions">
                    <Link href={`/admin/edit?id=${car.id}`}>編輯</Link>
                    {inReview(car) ? (
                      <>
                        <button disabled={busy} onClick={() => approve(car)}>核准上架</button>
                        <button className="danger" disabled={busy} onClick={() => reject(car)}>退回</button>
                      </>
                    ) : car.status === 'published' ? (
                      <button disabled={busy} onClick={() => patch(car, { status: 'unlisted' })}>下架</button>
                    ) : (
                      <button disabled={busy} onClick={() => approve(car)}>上架</button>
                    )}
                    {car.status === 'published' && (
                      <button disabled={busy} onClick={() => patch(car, { sold_at: car.sold_at ? null : new Date().toISOString() })}>
                        {car.sold_at ? '取消已售出' : '標示已售出'}
                      </button>
                    )}
                    {car.status === 'published' && (
                      <a href={`/zh/vehicles/${car.slug}`} target="_blank" rel="noopener noreferrer">預覽</a>
                    )}
                    <button className="danger" disabled={busy} onClick={() => remove(car)}>刪除</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
                      }
