'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import PartnerShell from '../../components/partner/PartnerShell';
import { fmtSlot } from '../../components/case/ViewingPanel';
import { getSupabase } from '../../lib/supabase';
import { STATUS_LABEL, statusTone, shortDate } from '../../lib/case';
import '../../styles/viewing.css';

export default function PartnerHome() {
  return (
    <PartnerShell>
      <MyCases />
    </PartnerShell>
  );
}

const taipeiDay = (v) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(v));

const FOLLOW = ['undecided', 'interested', 'considering', 'quoted'];

// 每個案件只歸到一個分類，依優先順序判斷
function bucketOf(c, waiting, settled) {
  if (['lost', 'cancelled'].includes(c.status) || c.partner_response === 'declined') return 'closed';
  // 成交後：VANTA 標記「已結算」（已付款）才移到「已結算」，否則留在待結算
  if (c.status === 'won') return settled.has(c.id) ? 'done' : 'settle';
  if (c.partner_response === 'pending') return 'new';
  // 這次看車之後已經回報過結果
  const reported = c.viewing_reported_at && (!c.viewing_at || new Date(c.viewing_reported_at) >= new Date(c.viewing_at));
  if (reported && c.last_viewing_result === 'sold') return 'settle';
  if (reported && FOLLOW.includes(c.last_viewing_result)) return 'followup';
  if (!reported && c.viewing_at && taipeiDay(c.viewing_at) === taipeiDay(Date.now())) return 'today';
  if (!reported && c.viewing_at && new Date(c.viewing_at) < new Date()) return 'report';
  if (c.viewing_at && new Date(c.viewing_at) > new Date()) return 'booked';
  return waiting.has(c.id) ? 'waiting' : 'schedule';
}

const TILES = [
  ['new', '🔴 新案件'],
  ['schedule', '🟡 待安排看車'],
  ['today', '🟢 今日看車'],
  ['report', '⚠️ 待回報'],
  ['settle', '💰 待結算'],
];
const TABS = [...TILES, ['waiting', '等待客戶確認時間'], ['booked', '已預約看車'], ['followup', '看車後追蹤'], ['done', '已結算'], ['closed', '已結束']];

function MyCases() {
  const [cases, setCases] = useState(null);
  const [waiting, setWaiting] = useState(new Set());
  const [settled, setSettled] = useState(new Set());
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('new');

  useEffect(() => {
    const sb = getSupabase();
    Promise.all([
      sb.from('cases')
        .select('id, case_no, subject, status, partner_response, viewing_at, viewing_reported_at, last_viewing_result, customer_request, last_activity_at')
        .order('last_activity_at', { ascending: false })
        .limit(500),
      sb.from('viewing_slots').select('case_id').eq('status', 'proposed').limit(1000),
      sb.from('partner_questions').select('id, case_id, topic, question').eq('status', 'open').order('created_at').limit(100),
      sb.from('sales').select('case_id, settlement:settlements!settlements_sale_id_fkey(settlement_status)').limit(1000),
    ]).then(([cr, sr, qr, sa]) => {
      if (cr.error) return setError('讀取失敗：' + cr.error.message);
      setCases(cr.data);
      setWaiting(new Set((sr.data || []).map((s) => s.case_id)));
      setQuestions(qr.data || []);
      const st = (x) => (Array.isArray(x.settlement) ? x.settlement[0] : x.settlement) || {};
      setSettled(new Set((sa.data || []).filter((x) => st(x).settlement_status === 'settled').map((x) => x.case_id)));
    });
  }, []);

  const grouped = useMemo(() => {
    const g = {};
    (cases || []).forEach((c) => {
      const k = bucketOf(c, waiting, settled);
      (g[k] = g[k] || []).push(c);
    });
    return g;
  }, [cases, waiting, settled]);

  useEffect(() => {
    // 沒有新案件時，預設打開第一個有案件的分類
    if (cases && !(grouped.new || []).length) {
      const first = TABS.find(([k]) => (grouped[k] || []).length);
      if (first) setTab(first[0]);
    }
  }, [cases]);

  const list = grouped[tab] || [];

  return (
    <>
      <h1>我的案件</h1>
      {questions.length > 0 && (
        <Link href={`/partner/cases/${questions[0].case_id}`} className="question-alert">
          ⚠️ 有 {questions.length} 個車況問題待回覆<br />
          <small>{(cases || []).find((c) => c.id === questions[0].case_id)?.case_no || ''}：{questions[0].question.slice(0, 40)} →</small>
        </Link>
      )}
      <div className="partner-tiles">
        {TILES.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            <span>{label}</span>
            <strong>{(grouped[k] || []).length}</strong>
          </button>
        ))}
      </div>
      <div className="tabs">
        {TABS.slice(5).map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label} {(grouped[k] || []).length}</button>
        ))}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!cases && !error && <p className="admin-muted">載入中…</p>}
      {cases && list.length === 0 && <p className="admin-muted">這裡目前沒有案件。</p>}

      {list.map((c) => (
        <Link key={c.id} href={`/partner/cases/${c.id}`} className="case-card">
          <div className="case-card-top">
            <span className="case-no">{c.case_no}</span>
            <span className={`badge badge-${tab === 'new' ? 'new' : statusTone(c.status)}`}>
              {tab === 'new' ? '新案件' : c.partner_response === 'declined' ? '已婉拒' : STATUS_LABEL[c.status]}
            </span>
          </div>
          <h3>{c.subject || '未指定車輛'}</h3>
          <p className="lead-meta">
            {c.viewing_at ? `看車：${fmtSlot(c.viewing_at)}｜` : ''}最後進度 {shortDate(c.last_activity_at)}
          </p>
          {c.customer_request && tab === 'new' && <p className="lead-meta" style={{ whiteSpace: 'pre-line' }}>{c.customer_request.slice(0, 80)}</p>}
          <div className="inline-actions">
            <span>
              {{ new: '接受案件', schedule: '安排看車', waiting: '查看', today: '查看看車', booked: '查看', report: '回報看車結果', followup: '更新結果', settle: '查看成交與結算', done: '查看結算', closed: '查看' }[tab]} →
            </span>
          </div>
        </Link>
      ))}
    </>
  );
}
