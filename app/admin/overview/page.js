'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { SETTLEMENT_LABEL, VERIFICATION_LABEL, APPROVAL_LABEL, CATEGORY_LABEL, nt, toneOf } from '../../../lib/deal';
import { shortDate } from '../../../lib/case';

export default function OverviewPage() {
  return (
    <AdminShell adminOnly>
      <Overview />
    </AdminShell>
  );
}

const RANK = { new: 0, in_progress: 0, transferred: 1, awaiting_partner: 1, replied: 1, viewing: 2, quoted: 3, won: 4, lost: 0, cancelled: 0 };
const FUNNEL = [['詢問', 0], ['轉交', 1], ['看車', 2], ['報價', 3], ['成交', 4]];
const REPORT_DAYS = 7;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(monthKey(new Date()));
  const [partner, setPartner] = useState('');
  const [q, setQ] = useState('');

  async function load() {
    const sb = getSupabase();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const head = { count: 'exact', head: true };
    const [cust, cases, viewing, verified, deals, costs, partners, settings, types] = await Promise.all([
      sb.from('customers').select('id', head).gte('created_at', today),
      sb.from('cases').select('id, case_no, subject, status, partner_id, created_at, last_activity_at').order('created_at', { ascending: false }).limit(3000),
      sb.from('case_events').select('id', head).eq('type', 'status').eq('meta->>to', 'viewing').gte('created_at', today),
      sb.from('case_events').select('id', head).eq('type', 'verified').gte('created_at', today),
      sb.from('sales')
        .select('*, case:cases!sales_case_id_fkey(id, case_no, subject), partner:partners!sales_partner_id_fkey(name), settlement:settlements!settlements_sale_id_fkey(*)')
        .order('updated_at', { ascending: false })
        .limit(2000),
      sb.from('sale_costs').select('*, sale:sales!sale_costs_sale_id_fkey(case_id, case:cases!sales_case_id_fkey(case_no, subject))').eq('approval', 'pending').order('created_at'),
      sb.from('partners').select('id, name').order('name'),
      sb.from('crm_settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('cost_types').select('*').order('sort_order'),
    ]);
    const err = cases.error || deals.error || costs.error;
    if (err) return setError('讀取失敗：' + err.message);

    const caseIds = (cases.data || []).map((c) => c.id);
    let statusEvents = [];
    if (caseIds.length) {
      const { data: ev } = await sb.from('case_events').select('case_id, meta').eq('type', 'status').limit(20000);
      statusEvents = ev || [];
    }

    setData({
      newCustomers: cust.count || 0,
      viewingToday: viewing.count || 0,
      wonToday: verified.count || 0,
      cases: cases.data || [],
      statusEvents,
      deals: (deals.data || []).map((d) => ({ ...d, settlement: Array.isArray(d.settlement) ? d.settlement[0] : d.settlement })),
      pendingCosts: costs.data || [],
      partners: partners.data || [],
      settings: settings.data || { cost_approval_threshold: 10000, vanta_share: 0.5 },
      types: types.data || [],
    });
  }

  useEffect(() => {
    load();
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const todayStr = new Date().toDateString();
    const inMonth = (d) => d && String(d).slice(0, 7) === month;

    const monthCases = data.cases.filter((c) => inMonth(c.created_at) && (!partner || c.partner_id === partner));
    const maxRank = {};
    data.statusEvents.forEach((e) => {
      const r = RANK[e.meta && e.meta.to] || 0;
      maxRank[e.case_id] = Math.max(maxRank[e.case_id] || 0, r);
    });
    const reached = (c) => Math.max(RANK[c.status] || 0, maxRank[c.id] || 0);
    const funnel = FUNNEL.map(([label, r]) => [label, monthCases.filter((c) => reached(c) >= r).length]);

    const k = q.trim().toLowerCase();
    const deals = data.deals.filter(
      (d) =>
        (!partner || d.partner_id === partner) &&
        (!k || [d.case && d.case.case_no, d.case && d.case.subject, d.partner && d.partner.name].filter(Boolean).join(' ').toLowerCase().includes(k))
    );
    const confirmedMonth = deals.filter((d) => d.verification === 'confirmed' && d.settlement && inMonth(d.sale_date || d.updated_at));
    const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

    return {
      todayCases: data.cases.filter((c) => new Date(c.created_at).toDateString() === todayStr).length,
      awaitingReport: data.cases.filter((c) => ['viewing', 'quoted'].includes(c.status)),
      staleReport: data.cases.filter(
        (c) => ['viewing', 'quoted'].includes(c.status) && Date.now() - new Date(c.last_activity_at).getTime() > REPORT_DAYS * 864e5
      ),
      pendingSettle: deals.filter((d) => d.settlement && d.settlement.settlement_status === 'pending'),
      conflicts: deals.filter((d) => d.verification === 'conflict' || (d.settlement && d.settlement.settlement_status === 'disputed')),
      monthCases: monthCases.length,
      funnel,
      monthWon: confirmedMonth.length,
      revenue: sum(confirmedMonth, (d) => d.settlement.sale_price),
      cost: sum(confirmedMonth, (d) => d.settlement.total_cost),
      profit: sum(confirmedMonth, (d) => d.settlement.gross_profit),
      vanta: sum(confirmedMonth, (d) => d.settlement.vanta_share),
      settled: confirmedMonth.filter((d) => d.settlement.settlement_status === 'settled'),
      unsettled: confirmedMonth.filter((d) => d.settlement.settlement_status !== 'settled'),
      deals,
    };
  }, [data, month, partner, q]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!data || !view) return <p className="admin-muted">載入中…</p>;

  async function reviewCost(cost, approval) {
    const reason = approval === 'rejected' ? prompt('拒絕原因（會讓車源看到）', '') : null;
    if (approval === 'rejected' && reason === null) return;
    const { error } = await getSupabase()
      .from('sale_costs')
      .update({ approval, reject_reason: reason || null, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', cost.id);
    if (error) return alert('操作失敗：' + error.message);
    load();
  }

  const maxFunnel = Math.max(1, view.funnel[0][1]);
  const months = [...new Set([monthKey(new Date()), ...data.deals.map((d) => String(d.sale_date || d.updated_at).slice(0, 7))])].sort().reverse();

  return (
    <>
      <h1>營運總覽</h1>

      <div className="kpis">
        <div className="kpi"><span>今日新客戶</span><strong>{data.newCustomers}</strong></div>
        <div className="kpi"><span>今日詢問</span><strong>{view.todayCases}</strong></div>
        <div className="kpi"><span>今日安排看車</span><strong>{data.viewingToday}</strong></div>
        <div className="kpi"><span>今日成交</span><strong>{data.wonToday}</strong></div>
        <div className="kpi"><span>待回報</span><strong>{view.awaitingReport.length}</strong></div>
        <div className="kpi"><span>待結算</span><strong>{view.pendingSettle.length}</strong></div>
      </div>

      {(view.conflicts.length > 0 || data.pendingCosts.length > 0 || view.staleReport.length > 0) && (
        <div className="admin-card">
          <h3>需要處理</h3>
          {view.conflicts.map((d) => (
            <Link key={d.id} href={`/admin/cases/${d.case_id}`} className="case-card">
              <div className="case-card-top">
                <span className="case-no">{d.case && d.case.case_no}</span>
                <span className="badge badge-warn">{d.verification === 'conflict' ? VERIFICATION_LABEL.conflict : SETTLEMENT_LABEL.disputed}</span>
              </div>
              <h3>{d.case && d.case.subject}</h3>
            </Link>
          ))}
          {view.staleReport.map((c) => (
            <Link key={c.id} href={`/admin/cases/${c.id}`} className="case-card">
              <div className="case-card-top">
                <span className="case-no">{c.case_no}</span>
                <span className="badge badge-warn">看車／報價後 {REPORT_DAYS} 天未回報</span>
              </div>
              <h3>{c.subject || '未指定車輛'}</h3>
              <p className="lead-meta">可以到案件中產生客戶確認連結，直接向客戶確認是否成交。</p>
            </Link>
          ))}
          {data.pendingCosts.map((c) => (
            <div className="case-card" key={c.id}>
              <div className="case-card-top">
                <span className="case-no">{c.sale && c.sale.case && c.sale.case.case_no}</span>
                <span className="badge badge-mid">{APPROVAL_LABEL.pending}</span>
              </div>
              <h3>{c.cost_type_name || CATEGORY_LABEL[c.category]}　{nt(c.amount)}</h3>
              <p className="lead-meta">{(c.sale && c.sale.case && c.sale.case.subject) || ''}{c.description ? `｜${c.description}` : ''}</p>
              <div className="inline-actions">
                <button onClick={() => reviewCost(c, 'approved')}>核准</button>
                <button className="danger" onClick={() => reviewCost(c, 'rejected')}>拒絕</button>
                {c.sale && <Link href={`/admin/cases/${c.sale.case_id}`}>查看案件與憑證</Link>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-card">
        <div className="field-grid">
          <label className="field"><span>月份</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field"><span>車源</span>
            <select value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="">全部車源</option>
              {data.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <input className="admin-search" style={{ marginTop: 12 }} type="search" placeholder="搜尋案件編號、品牌、車型" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="kpis">
          <div className="kpi"><span>本月案件</span><strong>{view.monthCases}</strong></div>
          <div className="kpi"><span>本月成交</span><strong>{view.monthWon}</strong></div>
          <div className="kpi"><span>成交率</span><strong>{pct(view.monthCases ? view.monthWon / view.monthCases : NaN)}</strong></div>
          <div className="kpi"><span>成交總額</span><strong>{nt(view.revenue)}</strong></div>
          <div className="kpi"><span>總成本</span><strong>{nt(view.cost)}</strong></div>
          <div className="kpi"><span>總利潤</span><strong>{nt(view.profit)}</strong></div>
          <div className="kpi"><span>VANTA 應收分潤</span><strong>{nt(view.vanta)}</strong></div>
          <div className="kpi"><span>已結算</span><strong>{view.settled.length}｜{nt(view.settled.reduce((s, d) => s + d.settlement.vanta_share, 0))}</strong></div>
          <div className="kpi"><span>待結算</span><strong>{view.unsettled.length}｜{nt(view.unsettled.reduce((s, d) => s + d.settlement.vanta_share, 0))}</strong></div>
        </div>

        <h3 style={{ marginTop: 20 }}>案件漏斗（{month} 建立的案件）</h3>
        <div className="funnel">
          {view.funnel.map(([label, n]) => (
            <div className="funnel-row" key={label}>
              <span>{label}</span>
              <div className="funnel-bar"><span style={{ width: `${(n / maxFunnel) * 100}%` }} /></div>
              <b>{n}</b>
            </div>
          ))}
        </div>
      </div>

      <h2 className="admin-sub">成交案件</h2>
      {view.deals.length === 0 && <p className="admin-muted">還沒有成交回報。</p>}
      {view.deals.map((d) => {
        const s = d.settlement;
        return (
          <Link key={d.id} href={`/admin/cases/${d.case_id}`} className="case-card">
            <div className="case-card-top">
              <span className="case-no">{d.case && d.case.case_no}・{d.partner ? d.partner.name : '未指定車源'}</span>
              <span className={`badge badge-${toneOf(s ? s.settlement_status : d.verification)}`}>
                {s ? SETTLEMENT_LABEL[s.settlement_status] : VERIFICATION_LABEL[d.verification]}
              </span>
            </div>
            <h3>{d.case && d.case.subject}</h3>
            <div className="money">
              <div className="money-row"><span>成交價</span><span>{nt(d.sale_price)}</span></div>
              {s && <div className="money-row"><span>核准成本</span><span>{nt(s.total_cost)}</span></div>}
              {s && <div className="money-row money-total"><span>可分配利潤</span><span>{nt(s.gross_profit)}</span></div>}
            </div>
            {s && (
              <div className="money-split">
                <div><span>VANTA</span><strong>{nt(s.vanta_share)}</strong></div>
                <div><span>車源</span><strong>{nt(s.partner_share)}</strong></div>
              </div>
            )}
          </Link>
        );
      })}

      <Settings settings={data.settings} types={data.types} onSaved={load} />
    </>
  );
}

function Settings({ settings, types, onSaved }) {
  const [threshold, setThreshold] = useState(String(settings.cost_approval_threshold));
  const [share, setShare] = useState(String(Math.round(Number(settings.vanta_share) * 100)));
  const [newType, setNewType] = useState({ name: '', category: 'reconditioning' });

  async function saveSettings() {
    const t = Math.round(Number(threshold));
    const s = Number(share) / 100;
    if (!(t >= 0) || !(s >= 0 && s <= 1)) return alert('請確認數字');
    const { error } = await getSupabase()
      .from('crm_settings')
      .upsert({ id: 1, cost_approval_threshold: t, vanta_share: s, updated_at: new Date().toISOString() });
    if (error) return alert('儲存失敗：' + error.message);
    alert('已儲存。分潤比例只會套用在之後重新計算的待結算案件。');
    onSaved();
  }

  async function toggleType(t) {
    const { error } = await getSupabase().from('cost_types').update({ active: !t.active, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) return alert('更新失敗：' + error.message);
    onSaved();
  }

  async function addType() {
    if (!newType.name.trim()) return;
    const { error } = await getSupabase().from('cost_types').insert({
      name: newType.name.trim(),
      category: newType.category,
      sort_order: types.length + 1,
    });
    if (error) return alert('新增失敗：' + error.message);
    setNewType({ name: '', category: 'reconditioning' });
    onSaved();
  }

  return (
    <div className="admin-card" style={{ marginTop: 32 }}>
      <h3>分潤與成本規則</h3>
      <div className="field-grid">
        <label className="field"><span>單筆成本超過多少需確認（元）</span><input type="number" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
        <label className="field"><span>VANTA 分潤比例（%）</span><input type="number" inputMode="numeric" value={share} onChange={(e) => setShare(e.target.value)} /></label>
      </div>
      <div className="form-actions"><button className="btn btn-dark btn-sm" onClick={saveSettings}>儲存規則</button></div>

      <h3 style={{ marginTop: 20 }}>可扣除成本類型</h3>
      <p className="admin-muted">車源只能從啟用中的類型新增成本。點一下可以停用或啟用。</p>
      <div className="chips">
        {types.map((t) => (
          <button key={t.id} className={t.active ? '' : 'off'} onClick={() => toggleType(t)}>
            {t.name}・{CATEGORY_LABEL[t.category]}
          </button>
        ))}
      </div>
      <div className="add-row">
        <input placeholder="新增成本類型" value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} />
        <select
          style={{ height: 44, borderRadius: 10, border: '1px solid var(--line)', padding: '0 8px' }}
          value={newType.category}
          onChange={(e) => setNewType({ ...newType, category: e.target.value })}
        >
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-dark btn-sm" onClick={addType}>新增</button>
      </div>
      <p className="admin-muted">最後更新 {settings.updated_at ? shortDate(settings.updated_at) : '—'}</p>
    </div>
  );
}
