'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { CLOSED, STATUS_LABEL, TYPE_LABEL, isStale, statusTone, shortDate } from '../../../lib/case';

export default function CasesPage() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="admin-muted">載入中…</p>}>
        <Cases />
      </Suspense>
    </AdminShell>
  );
}

const TABS = [
  ['unread', '待回覆'],
  ['open', '進行中'],
  ['attention', '需要注意'],
  ['won', '成交'],
  ['closed', '未成交／取消'],
  ['all', '全部'],
  ['inquiries', '網站詢問'],
];

function Cases() {
  const customerFilter = useSearchParams().get('customer');
  const [cases, setCases] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(customerFilter ? 'all' : 'open');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      let query = sb
        .from('cases')
        .select('*, customer:customers(name, phone, line_name), partner:partners(name), car:cars(title)')
        .order('last_activity_at', { ascending: false })
        .limit(500);
      if (customerFilter) query = query.eq('customer_id', customerFilter);
      const [c, i] = await Promise.all([
        query,
        sb.from('web_inquiries').select('*').eq('handled', false).order('created_at', { ascending: false }).limit(100),
      ]);
      if (c.error) return setError('讀取失敗：' + c.error.message);
      setCases(c.data);
      setInquiries(i.data || []);
    })();
  }, [customerFilter]);

  const counts = useMemo(() => {
    const list = cases || [];
    return {
      unread: list.filter((c) => c.unread).length,
      open: list.filter((c) => !CLOSED.includes(c.status)).length,
      attention: list.filter((c) => isStale(c) || (!c.partner_id && !CLOSED.includes(c.status) && c.type !== 'sell')).length,
      won: list.filter((c) => c.status === 'won').length,
      closed: list.filter((c) => c.status === 'lost' || c.status === 'cancelled').length,
      all: list.length,
      inquiries: inquiries.length,
    };
  }, [cases, inquiries]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (cases || [])
      .filter((c) => {
        if (tab === 'unread') return c.unread;
        if (tab === 'open') return !CLOSED.includes(c.status);
        if (tab === 'attention') return isStale(c) || (!c.partner_id && !CLOSED.includes(c.status) && c.type !== 'sell');
        if (tab === 'won') return c.status === 'won';
        if (tab === 'closed') return c.status === 'lost' || c.status === 'cancelled';
        return true;
      })
      .filter((c) => {
        if (!k) return true;
        const hay = [c.case_no, c.subject, c.customer && c.customer.name, c.customer && c.customer.phone, c.partner && c.partner.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(k);
      });
  }, [cases, tab, q]);

  async function skipInquiry(id) {
    const { error } = await getSupabase().from('web_inquiries').update({ handled: true }).eq('id', id);
    if (error) return alert('更新失敗：' + error.message);
    setInquiries((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <>
      <div className="admin-row-head">
        <h1>案件</h1>
        <Link href="/admin/cases/new" className="btn btn-dark btn-sm">＋ 新增案件</Link>
      </div>
      {customerFilter && (
        <p className="admin-muted">只顯示這位客戶的案件。<Link href="/admin/cases" className="text-link">顯示全部</Link></p>
      )}

      <input className="admin-search" type="search" placeholder="搜尋案件編號、客戶、車輛、車源" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label} {counts[k] || 0}</button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!cases && !error && <p className="admin-muted">載入中…</p>}

      {tab === 'inquiries' ? (
        <>
          <p className="admin-muted">客人在車輛頁按了 LINE 詢問。客人在 LINE 送出訊息後會自動建立案件；這裡是還沒傳訊息的詢問。</p>
          {inquiries.length === 0 && <p className="admin-muted">目前沒有待處理的網站詢問。</p>}
          {inquiries.map((i) => (
            <div className="case-card" key={i.id}>
              <div className="case-card-top">
                <span className="case-no">{shortDate(i.created_at)}・{i.lang === 'en' ? '英文頁' : '中文頁'}</span>
                <span className="badge badge-new">網站詢問</span>
              </div>
              <h3>{i.car_title || '車輛已刪除'}</h3>
              <div className="inline-actions">
                <Link href={`/admin/cases/new?car=${i.car_id || ''}&inquiry=${i.id}`}>建立案件</Link>
                <button onClick={() => skipInquiry(i.id)}>略過</button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          {cases && list.length === 0 && <p className="admin-muted">沒有符合的案件。</p>}
          {list.map((c) => (
            <Link href={`/admin/cases/${c.id}`} className="case-card" key={c.id}>
              <div className="case-card-top">
                <span className="case-no">{c.case_no}・{TYPE_LABEL[c.type]}</span>
                <span className={`badge badge-${statusTone(c.status)}`}>{STATUS_LABEL[c.status]}</span>
              </div>
              <h3>{c.subject || (c.car && c.car.title) || '未指定車輛'}</h3>
              <p className="lead-meta">
                客戶：{(c.customer && (c.customer.name || c.customer.line_name)) || '未建立'}
                {c.partner ? `｜車源：${c.partner.name}` : ''}
                <br />
                最後進度 {shortDate(c.last_activity_at)}
              </p>
              <div className="case-flags">
                {c.unread && <span className="badge badge-new">客戶有新訊息</span>}
                {isStale(c) && <span className="badge badge-warn">超過 2 天沒有進度</span>}
                {!c.partner_id && !CLOSED.includes(c.status) && c.type !== 'sell' && <span className="badge badge-warn">尚未指定車源</span>}
              </div>
            </Link>
          ))}
        </>
      )}
    </>
  );
                    }
