'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminShell, { useRole } from '../../../../components/admin/AdminShell';
import DealPanel from '../../../../components/admin/DealPanel';
import { getSupabase } from '../../../../lib/supabase';
import {
  CASE_STATUS, STATUS_LABEL, TYPE_LABEL, SOURCE_LABEL, CLOSED,
  statusTone, shortDate, carRef, buildTransferMessage, isStale,
} from '../../../../lib/case';

export default function CaseDetailPage() {
  return (
    <AdminShell>
      <CaseDetail />
    </AdminShell>
  );
}

const FIELD_LABEL = {
  status: '狀態', partner_id: '車源', customer_id: '客戶', car_id: '車輛',
  subject: '車輛名稱', customer_request: '客戶需求', type: '類型', source: '來源',
};

const partnerLineUrl = (p) => (p && p.line_id ? `https://line.me/ti/p/~${encodeURIComponent(p.line_id)}` : '');

function CaseDetail() {
  const { id } = useParams();
  const { role, profile, session } = useRole();
  const [c, setC] = useState(null);
  const [events, setEvents] = useState([]);
  const [partners, setPartners] = useState([]);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [shareNote, setShareNote] = useState(false);
  const [request, setRequest] = useState('');
  const [transferMsg, setTransferMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [lineMsg, setLineMsg] = useState('');
  const [lineBusy, setLineBusy] = useState(false);

  async function load() {
    const sb = getSupabase();
    const [cr, ev, pr] = await Promise.all([
      sb.from('cases')
        .select('*, customer:customers(*), partner:partners(*), car:cars(id, title, slug, status)')
        .eq('id', id)
        .maybeSingle(),
      sb.from('case_events').select('*').eq('case_id', id).order('created_at'),
      sb.from('partners').select('id, name, active, line_id').order('name'),
    ]);
    if (cr.error || !cr.data) return setError('找不到這個案件');
    setC(cr.data);
    setRequest(cr.data.customer_request || '');
    setEvents(ev.data || []);
    setPartners(pr.data || []);
    if (role === 'admin') {
      const { data } = await sb.from('audit_log').select('*').eq('table_name', 'cases').eq('row_id', id).order('created_at', { ascending: false }).limit(50);
      setAudit(data || []);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!c) return <p className="admin-muted">載入中…</p>;

  const partnerName = (pid) => (partners.find((p) => p.id === pid) || {}).name || '未指定';

  async function update(patch) {
    const { error } = await getSupabase().from('cases').update(patch).eq('id', c.id);
    if (error) return alert('更新失敗：' + error.message);
    load();
  }

  async function addEvent(type, body, visibility = 'internal') {
    const { error } = await getSupabase().from('case_events').insert({
      case_id: c.id,
      type,
      body,
      visibility,
      actor_id: session.user.id,
      actor_label: (profile && profile.display_name) || '後台',
    });
    if (error) alert('紀錄失敗：' + error.message);
  }

  async function saveNote() {
    if (!note.trim()) return;
    await addEvent('note', note.trim(), shareNote ? 'partner' : 'internal');
    setNote('');
    setShareNote(false);
    load();
  }

  function copyTransfer(msg) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(msg).then(() => setCopied(true)).catch(() => setCopied(false));
  }

  async function callLine(action, extra = {}) {
    const res = await fetch('/api/admin/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, caseId: c.id, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'LINE 傳送失敗');
    return data;
  }

  async function sendConfirmation() {
    if (!confirm('用 LINE 傳送成交確認給客戶？客戶可以直接在 LINE 按「是，已成交」或「尚未成交」。')) return;
    setLineBusy(true);
    try {
      await callLine('send_confirmation');
      setLineMsg('已透過 LINE 傳送成交確認給客戶。');
      load();
    } catch (e) {
      setLineMsg(e.message);
    }
    setLineBusy(false);
  }

  async function markReplied() {
    await getSupabase().from('cases').update({ unread: false }).eq('id', c.id);
    await addEvent('note', '已回覆客戶訊息');
    load();
  }

  function transfer() {
    if (!c.partner_id) return alert('請先指定車源負責人');
    const msg = buildTransferMessage({ ...c, customer_request: request || c.customer_request });

    // 車源已綁定 LINE：直接由官方帳號通知
    if (c.partner && c.partner.line_user_id) {
      setTransferMsg(msg);
      setLineBusy(true);
      (async () => {
        try {
          await callLine('notify_partner', { message: msg });
          setLineMsg(`已透過 LINE 通知 ${c.partner.name}。`);
          await addEvent('transfer', `轉交給 ${c.partner.name}\n\n${msg}`, 'partner');
          if (['new', 'in_progress'].includes(c.status)) await update({ status: 'transferred' });
          else load();
        } catch (e) {
          setLineMsg(e.message);
        }
        setLineBusy(false);
      })();
      return;
    }

    // 必須在按下的當下就複製和開啟 LINE，手機瀏覽器才不會擋
    copyTransfer(msg);
    const url = partnerLineUrl(c.partner);
    if (url) window.open(url, '_blank');
    setTransferMsg(msg);

    (async () => {
      await addEvent('transfer', `轉交給 ${c.partner ? c.partner.name : ''}\n\n${msg}`, 'partner');
      if (['new', 'in_progress'].includes(c.status)) await update({ status: 'transferred' });
      else load();
    })();
  }

  function eventText(e) {
    if (e.type === 'status' && e.meta) return `狀態：${STATUS_LABEL[e.meta.from] || '—'} → ${STATUS_LABEL[e.meta.to] || '—'}`;
    if (e.type === 'assigned' && e.meta) return `車源負責人：${e.meta.from ? partnerName(e.meta.from) : '未指定'} → ${e.meta.to ? partnerName(e.meta.to) : '未指定'}`;
    return e.body;
  }

  function auditText(a) {
    if (a.action === 'INSERT') return '建立案件';
    if (a.action === 'DELETE') return '刪除案件';
    const changed = Object.keys(a.new_data || {}).filter(
      (k) => !['updated_at', 'last_activity_at'].includes(k) && JSON.stringify(a.new_data[k]) !== JSON.stringify((a.old_data || {})[k])
    );
    return changed.map((k) => FIELD_LABEL[k] || k).join('、') || '更新';
  }

  const cu = c.customer;
  const lineUrl = partnerLineUrl(c.partner);

  return (
    <>
      <div className="case-head">
        <p className="case-no">{c.case_no}・{TYPE_LABEL[c.type]}・{SOURCE_LABEL[c.source] || c.source}</p>
        <h1>{c.subject || (c.car && c.car.title) || '未指定車輛'}</h1>
        <div className="case-flags">
          <span className={`badge badge-${statusTone(c.status)}`}>{STATUS_LABEL[c.status]}</span>
          {isStale(c) && <span className="badge badge-warn">超過 2 天沒有進度</span>}
          {c.unread && <span className="badge badge-new">客戶有新訊息</span>}
        </div>
        {c.unread && (
          <div className="inline-actions">
            <button onClick={markReplied}>已在 LINE 回覆，標記為已處理</button>
          </div>
        )}
      </div>

      <div className="case-section">
        <h3>狀態</h3>
        <select value={c.status} onChange={(e) => update({ status: e.target.value })}>
          {CASE_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div className="case-section">
        <h3>客戶</h3>
        {cu ? (
          <p className="value">
            {cu.name || cu.line_name || '未命名'}
            {cu.phone && <><br /><a href={`tel:${cu.phone}`}>{cu.phone}</a></>}
            {cu.line_name && <><br />LINE：{cu.line_name}</>}
            {cu.line_user_id && <><br /><span className="badge badge-ok">已連結 LINE 官方帳號</span></>}
          </p>
        ) : (
          <p className="value">尚未建立客戶資料</p>
        )}
        {cu && (
          <div className="inline-actions">
            <Link href={`/admin/customers?id=${cu.id}`}>客戶資料</Link>
            {cu.line_user_id && c.type !== 'sell' && c.status !== 'won' && (
              <button onClick={sendConfirmation} disabled={lineBusy}>用 LINE 請客戶確認成交</button>
            )}
          </div>
        )}
        {lineMsg && <p className="result-box">{lineMsg}</p>}
      </div>

      <div className="case-section">
        <h3>車輛與車源</h3>
        <p className="value">
          {c.car ? `${c.car.title}（編號 ${carRef(c.car.id)}）` : c.subject || '未指定車輛'}
        </p>
        {c.car && c.car.status === 'published' && (
          <div className="inline-actions">
            <a href={`/zh/vehicles/${c.car.slug}`} target="_blank" rel="noopener noreferrer">查看車輛頁</a>
          </div>
        )}
        <select value={c.partner_id || ''} onChange={(e) => update({ partner_id: e.target.value || null })}>
          <option value="">車源負責人：未指定</option>
          {partners.filter((p) => p.active || p.id === c.partner_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {c.type !== 'sell' && !CLOSED.includes(c.status) && (
          <div className="case-actions">
            <button className="btn line-green" onClick={transfer} disabled={lineBusy}>
              {c.partner && c.partner.line_user_id ? '轉交並用 LINE 通知車源' : '轉交車源負責人'}
            </button>
          </div>
        )}
        {transferMsg && !(c.partner && c.partner.line_user_id) && (
          <div className="result-box">
            {copied ? '已複製轉交訊息，' : ''}
            {lineUrl ? '在車源的 LINE 對話中貼上即可。' : '這位車源沒有填 LINE ID，請手動傳給對方。'}
            <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', marginTop: 8 }}>{transferMsg}</pre>
            <div className="inline-actions">
              <button onClick={() => copyTransfer(transferMsg)}>{copied ? '已複製' : '複製訊息'}</button>
              {lineUrl && <a href={lineUrl} target="_blank" rel="noopener noreferrer">開啟 {c.partner.name} 的 LINE</a>}
            </div>
          </div>
        )}
      </div>

      <div className="case-section">
        <h3>客戶需求</h3>
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onBlur={() => request !== (c.customer_request || '') && update({ customer_request: request.trim() || null })}
        />
      </div>

      {role === 'admin' && <DealPanel caseRow={c} onChange={load} />}

      <div className="case-section">
        <h3>新增紀錄</h3>
        <textarea placeholder="例如：已回覆客戶里程與車況，約週六 14:00 看車" value={note} onChange={(e) => setNote(e.target.value)} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 14 }}>
          <input type="checkbox" style={{ width: 'auto', height: 'auto', margin: 0 }} checked={shareNote} onChange={(e) => setShareNote(e.target.checked)} />
          車源負責人也看得到
        </label>
        <div className="case-actions"><button className="btn btn-dark" onClick={saveNote}>新增紀錄</button></div>
      </div>

      <div className="case-section">
        <h3>Timeline</h3>
        <ul className="timeline">
          {events.map((e) => (
            <li key={e.id}>
              <time>{shortDate(e.created_at)}</time>
              <p>{eventText(e)}</p>
              <span className="who">
                {e.actor_label || '系統'}{e.visibility === 'partner' ? '・車源可見' : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {role === 'admin' && audit.length > 0 && (
        <div className="case-section">
          <h3>變更紀錄（僅管理員可見）</h3>
          <ul className="rank">
            {audit.map((a) => (
              <li key={a.id}><span>{auditText(a)}</span><span>{shortDate(a.created_at)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
          }
