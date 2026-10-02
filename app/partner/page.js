'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PartnerShell from '../../components/partner/PartnerShell';
import { getSupabase } from '../../lib/supabase';
import { STATUS_LABEL, statusTone, shortDate } from '../../lib/case';

export default function PartnerHome() {
  return (
    <PartnerShell>
      <MyCases />
    </PartnerShell>
  );
}

const GROUPS = [
  ['todo', '待處理', ['new', 'in_progress', 'transferred', 'awaiting_partner', 'replied']],
  ['viewing', '看車中', ['viewing']],
  ['report', '待回報', ['quoted']],
  ['won', '已成交', ['won']],
  ['closed', '未成交', ['lost', 'cancelled']],
];

function MyCases() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('todo');

  useEffect(() => {
    getSupabase()
      .from('cases')
      .select('id, case_no, subject, status, last_activity_at, customer:customers(name, line_name)')
      .order('last_activity_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => (error ? setError('讀取失敗：' + error.message) : setCases(data)));
  }, []);

  const counts = useMemo(() => {
    const c = {};
    GROUPS.forEach(([k, , statuses]) => { c[k] = (cases || []).filter((x) => statuses.includes(x.status)).length; });
    return c;
  }, [cases]);

  const statuses = (GROUPS.find((g) => g[0] === tab) || GROUPS[0])[2];
  const list = (cases || []).filter((c) => statuses.includes(c.status));

  return (
    <>
      <h1>我的案件</h1>
      <div className="kpis">
        {GROUPS.slice(0, 4).map(([k, label]) => (
          <button key={k} className="kpi" style={{ textAlign: 'left' }} onClick={() => setTab(k)}>
            <span>{label}</span>
            <strong>{counts[k] || 0}</strong>
          </button>
        ))}
      </div>
      <div className="tabs">
        {GROUPS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label} {counts[k] || 0}</button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!cases && !error && <p className="admin-muted">載入中…</p>}
      {cases && list.length === 0 && <p className="admin-muted">這裡目前沒有案件。</p>}

      {list.map((c) => (
        <Link key={c.id} href={`/partner/cases/${c.id}`} className="case-card">
          <div className="case-card-top">
            <span className="case-no">{c.case_no}</span>
            <span className={`badge badge-${statusTone(c.status)}`}>{STATUS_LABEL[c.status]}</span>
          </div>
          <h3>{c.subject || '未指定車輛'}</h3>
          <p className="lead-meta">
            客戶：{(c.customer && (c.customer.name || c.customer.line_name)) || '—'}｜最後進度 {shortDate(c.last_activity_at)}
          </p>
          <div className="inline-actions">
            <span>{c.status === 'won' ? '查看結算' : ['viewing', 'quoted'].includes(c.status) ? '回報成交' : '回報進度'} →</span>
          </div>
        </Link>
      ))}
    </>
  );
}
