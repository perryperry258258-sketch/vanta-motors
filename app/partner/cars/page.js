'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PartnerShell, { usePartner } from '../../../components/partner/PartnerShell';
import { getSupabase, photoUrl } from '../../../lib/supabase';

export default function PartnerCarsPage() {
  return (
    <PartnerShell>
      <MyCars />
    </PartnerShell>
  );
}

function stateOf(car) {
  if (car.status === 'published') return ['live', '已上架', 'badge-ok'];
  if (car.review_status === 'pending') return ['review', '審核中', 'badge-mid'];
  if (car.review_status === 'rejected') return ['rejected', '已退回', 'badge-warn'];
  if (car.status === 'unlisted') return ['off', '已下架', 'badge-off'];
  return ['draft', '草稿', 'badge-mid'];
}

const TABS = [['all', '全部'], ['live', '已上架'], ['review', '審核中'], ['draft', '草稿／退回'], ['off', '已下架']];

function MyCars() {
  const { profile } = usePartner();
  const [cars, setCars] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    const { data, error } = await getSupabase()
      .from('cars')
      .select('id, slug, title, year, price, price_max, status, review_status, review_note, updated_at, car_photos(path, sort_order)')
      // 只列出自己提供的車（網站上公開的其他車源車輛不顯示在這裡）
      .eq('source_owner_id', profile.partner_id)
      .order('updated_at', { ascending: false })
      .order('sort_order', { referencedTable: 'car_photos' })
      .limit(1, { referencedTable: 'car_photos' });
    if (error) return setError('讀取失敗：' + error.message);
    setCars(data);
  }

  useEffect(() => {
    load();
  }, []);

  const list = useMemo(() => {
    return (cars || []).filter((c) => {
      const s = stateOf(c)[0];
      if (tab === 'all') return true;
      if (tab === 'draft') return s === 'draft' || s === 'rejected';
      return s === tab;
    });
  }, [cars, tab]);

  async function patch(car, values, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    setBusyId(car.id);
    const { error } = await getSupabase()
      .from('cars')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', car.id)
      .eq('source_owner_id', profile.partner_id);
    setBusyId(null);
    if (error) return alert('更新失敗：' + error.message);
    load();
  }

  return (
    <>
      <div className="admin-row-head">
        <h1>我的車輛</h1>
        <Link href="/partner/cars/edit" className="btn btn-dark btn-sm">＋ 新增車輛</Link>
      </div>
      <p className="admin-muted">新車送出後由 VANTA 審核上架。已上架的車可以直接修改價格和資料，賣掉了記得按「下架」。</p>

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!cars && !error && <p className="admin-muted">載入中…</p>}
      {cars && list.length === 0 && <p className="admin-muted">{cars.length ? '這裡沒有車輛。' : '還沒有車輛，按「＋ 新增車輛」開始。'}</p>}

      {list.length > 0 && (
        <div className="car-rows">
          {list.map((car) => {
            const p = car.car_photos && car.car_photos[0];
            const [state, label, tone] = stateOf(car);
            const busy = busyId === car.id;
            return (
              <div className="car-row" key={car.id}>
                <div className="car-row-img">{p && <img src={photoUrl(p.path)} alt="" loading="lazy" />}</div>
                <div>
                  <h3>{car.title}</h3>
                  <p className="car-row-meta">
                    {car.year || '年份未填'}
                    <span className={`badge ${tone}`} style={{ marginLeft: 8 }}>{label}</span>
                  </p>
                  {state === 'rejected' && car.review_note && <p className="car-row-meta">退回原因：{car.review_note}</p>}
                  <div className="car-row-actions">
                    <Link href={`/partner/cars/edit?id=${car.id}`}>編輯</Link>
                    {state === 'live' && (
                      <>
                        <a href={`/zh/vehicles/${car.slug}`} target="_blank" rel="noopener noreferrer">查看</a>
                        <button className="danger" disabled={busy} onClick={() => patch(car, { status: 'unlisted' }, `確定下架「${car.title}」？`)}>下架</button>
                      </>
                    )}
                    {(state === 'draft' || state === 'rejected' || state === 'off') && (
                      <button disabled={busy} onClick={() => patch(car, { review_status: 'pending', review_note: null, status: 'draft' })}>送出審核</button>
                    )}
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
