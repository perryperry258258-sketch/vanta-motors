'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { shortDate, STATUS_LABEL } from '../../../lib/case';
import { FIND_STATUS, FIND_STATUS_LABEL, TIER_LABEL, matchScore, matchTier, budgetText } from '../../../lib/find';

export default function FindRequestsPage() {
  return (
    <AdminShell>
      <FindRequests />
    </AdminShell>
  );
}

const OPEN = ['new', 'in_progress', 'searching', 'candidates', 'offered', 'viewing', 'quoted'];
const nt = (n) => (n ? `NT$${Number(n).toLocaleString('en-US')}` : '—');

function FindRequests() {
  const [list, setList] = useState(null);
  const [cars, setCars] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [openId, setOpenId] = useState(null);

  async function load() {
    const sb = getSupabase();
    const [r, c] = await Promise.all([
      sb.from('find_car_requests')
        .select('*, customer:customers(name, line_name), case:cases!find_car_requests_case_id_fkey(id, case_no, status)')
        .order('created_at', { ascending: false })
        .limit(500),
      sb.from('cars').select('id, slug, title, brand, model, year, mileage, price, price_max, status, source_owner_id, partner:partners(name)').in('status', ['published', 'draft']).limit(3000),
    ]);
    if (r.error) return setError('讀取失敗：' + r.error.message);
    setList(r.data);
    setCars(c.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const all = list || [];
    if (tab === 'open') return all.filter((x) => OPEN.includes(x.status));
    if (tab === 'line') return all.filter((x) => x.case_id);
    if (tab === 'closed') return all.filter((x) => !OPEN.includes(x.status));
    return all;
  }, [list, tab]);

  async function setStatus(r, status) {
    const { error } = await getSupabase().from('find_car_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', r.id);
    if (error) return alert('更新失敗：' + error.message);
    load();
  }

  async function createCase(r) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('cases')
      .insert({
        type: 'find',
        status: 'in_progress',
        source: 'website',
        customer_id: r.customer_id,
        subject: `${r.year_from ? `${r.year_from} ` : ''}${r.brand} ${r.model}`,
        customer_request: summary(r),
      })
      .select('id')
      .single();
    if (error) return alert('建立失敗：' + error.message);
    await sb.from('find_car_requests').update({ case_id: data.id, status: r.status === 'new' ? 'in_progress' : r.status }).eq('id', r.id);
    load();
  }

  const counts = {
    open: (list || []).filter((x) => OPEN.includes(x.status)).length,
    line: (list || []).filter((x) => x.case_id).length,
    closed: (list || []).filter((x) => !OPEN.includes(x.status)).length,
    all: (list || []).length,
  };

  return (
    <>
      <h1>找車需求</h1>
      <p className="admin-muted">客人在網站「我要找車」送出的需求。客人按下 LINE 並送出訊息後，會自動建立找車案件。</p>
      <div className="tabs">
        {[['open', '進行中'], ['line', '已進 LINE'], ['closed', '已結束'], ['all', '全部']].map(([k, l]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l} {counts[k]}</button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!list && !error && <p className="admin-muted">載入中…</p>}
      {list && filtered.length === 0 && <p className="admin-muted">目前沒有找車需求。</p>}

      {filtered.map((r) => {
        const matches = openId === r.id
          ? cars
              .map((car) => ({ car, score: matchScore(r, car) }))
              .filter((x) => x.score >= 40)
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
          : [];
        return (
          <div className="case-card" key={r.id}>
            <div className="case-card-top">
              <span className="case-no">{shortDate(r.created_at)}{r.case ? `・${r.case.case_no}` : '・尚未進 LINE'}</span>
              <span className="badge badge-mid">{FIND_STATUS_LABEL[r.status]}</span>
            </div>
            <h3>{r.year_from ? `${r.year_from} ` : ''}{r.brand} {r.model}{r.year_from ? '' : '（年份不限）'}</h3>
            <p className="lead-meta">
              里程 {r.mileage_max ? `${Number(r.mileage_max).toLocaleString('en-US')} km 以下` : '不限'}｜預算 {budgetText('zh', r.budget_min, r.budget_max)}
              <br />
              預估尋車區間 {r.estimated_search_low ? `${nt(r.estimated_search_low)}–${nt(r.estimated_search_high)}` : '資料不足'}
              {r.customer ? `｜客戶：${r.customer.name || r.customer.line_name || '—'}` : ''}
              {[r.fuel, r.body_type, r.color, r.region].filter(Boolean).length > 0 && <><br />{[r.fuel, r.body_type, r.color, r.region].filter(Boolean).join('・')}</>}
              {r.notes && <><br />需求：{r.notes}</>}
            </p>
            <select className="lead-status" value={r.status} onChange={(e) => setStatus(r, e.target.value)}>
              {FIND_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div className="inline-actions">
              {r.case ? (
                <Link href={`/admin/cases/${r.case.id}`}>案件 {r.case.case_no}（{STATUS_LABEL[r.case.status]}）</Link>
              ) : (
                <button onClick={() => createCase(r)}>手動建立案件</button>
              )}
              <button onClick={() => setOpenId(openId === r.id ? null : r.id)}>{openId === r.id ? '收起配對' : '配對車源'}</button>
            </div>
            {openId === r.id && (
              <div className="result-box">
                {matches.length === 0 && '目前庫存與合作車源中沒有相近的車輛。'}
                {matches.map(({ car, score }) => (
                  <div key={car.id} className="money-row">
                    <span>
                      <span className={`find-tier find-tier-${matchTier(score)}`}>{TIER_LABEL.zh[matchTier(score)]}</span>{' '}
                      {car.title}{car.partner ? `｜${car.partner.name}` : '｜VANTA'}{car.status === 'draft' ? '（草稿）' : ''}
                    </span>
                    <Link href={`/admin/edit?id=${car.id}`}>查看</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function summary(r) {
  return [
    `想找：${r.year_from ? `${r.year_from} ` : ''}${r.brand} ${r.model}`,
    `里程：${r.mileage_max ? `${r.mileage_max} km 以下` : '不限'}`,
    `預算：${budgetText('zh', r.budget_min, r.budget_max)}`,
    r.notes ? `其他需求：${r.notes}` : null,
  ].filter(Boolean).join('\n');
                               }
