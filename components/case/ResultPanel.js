'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import { RESULTS, RESULT_LABEL, FOLLOW_RESULTS, followUpMessage } from '../../lib/results';
import { GUARANTEE_RE, fmtTime } from '../../lib/questions';
import '../../styles/viewing.css';

const nt = (n) => (n ? `NT$${Number(n).toLocaleString('en-US')}` : '—');
const CLOSED = ['won', 'lost', 'cancelled'];

async function api(url, payload) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session ? data.session.access_token : ''}` },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || '操作失敗');
  return out;
}

const EMPTY = { result: '', budget: '', quote: '', reaction: '', questions: '', nextStep: '', note: '' };

// 看車結果與跟進（後台與車源頁共用）
// mode = 'partner'：回報看車結果；mode = 'staff'：查看結果、設定跟進日期、用 LINE 跟進客戶
export default function ResultPanel({ caseRow, mode, customerName = '', hasCustomerLine = false, onSold, onChange }) {
  const [results, setResults] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [follow, setFollow] = useState({ date: '', note: '' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await getSupabase().from('viewing_results').select('*').eq('case_id', caseRow.id).order('created_at', { ascending: false });
    setResults(data || []);
  }

  useEffect(() => {
    load();
    setFollow({ date: caseRow.follow_up_at ? caseRow.follow_up_at.slice(0, 10) : '', note: caseRow.follow_up_note || '' });
    setDraft(followUpMessage(customerName, caseRow.subject));
  }, [caseRow.id, caseRow.last_activity_at]);

  const closed = CLOSED.includes(caseRow.status);
  const latest = results[0];

  async function submit() {
    if (!form.result) return setMsg('請選擇看車結果');
    setBusy(true);
    setMsg('');
    try {
      const out = await api('/api/partner/case', { caseId: caseRow.id, action: 'viewing_result', ...form });
      setForm(EMPTY);
      setOpen(false);
      setMsg(out.sold ? '已回報看車結果。請接著在下方填寫成交資料，VANTA 會請客戶確認。' : '已回報看車結果，VANTA 會接續跟進客戶。');
      await load();
      if (onChange) onChange();
      if (out.sold && onSold) onSold();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function saveFollow() {
    const at = follow.date ? new Date(`${follow.date}T10:00:00+08:00`).toISOString() : null;
    const sb = getSupabase();
    const { error } = await sb.from('cases').update({ follow_up_at: at, follow_up_note: follow.note.trim() || null }).eq('id', caseRow.id);
    if (error) return setMsg('儲存失敗：' + error.message);
    const { data } = await sb.auth.getSession();
    await sb.from('case_events').insert({
      case_id: caseRow.id,
      type: 'note',
      body: at ? `設定跟進日期：${follow.date}${follow.note.trim() ? `（${follow.note.trim()}）` : ''}` : '取消跟進日期',
      visibility: 'internal',
      actor_id: data.session && data.session.user.id,
      actor_label: '客服',
    });
    setMsg(at ? `已設定 ${follow.date} 跟進，當天會出現在案件列表「待跟進」。` : '已取消跟進日期。');
    if (onChange) onChange();
  }

  async function sendFollow() {
    setBusy(true);
    setMsg('');
    try {
      await api('/api/admin/followup', { caseId: caseRow.id, text: draft });
      setMsg('已用 LINE 跟進客戶。');
      if (onChange) onChange();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  const set = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const history = (
    <>
      {results.map((r, i) => (
        <div className="question-done" key={r.id}>
          <p>
            <span className={`badge badge-${r.result === 'sold' ? 'ok' : r.result === 'no_interest' ? 'off' : 'mid'}`}>{RESULT_LABEL[r.result]}</span>
            {' '}{r.created_by_label || '車源'}｜{fmtTime(r.created_at)}
          </p>
          {r.customer_budget && <p>客戶預算：{nt(r.customer_budget)}</p>}
          {r.partner_quote && <p>車源報價：{nt(r.partner_quote)}{results[i + 1] && results[i + 1].partner_quote && results[i + 1].partner_quote !== r.partner_quote ? `（前次 ${nt(results[i + 1].partner_quote)}）` : ''}</p>}
          {r.customer_reaction && <p>客戶反應：{r.customer_reaction}</p>}
          {r.customer_questions && <p>客戶問題：{r.customer_questions}</p>}
          {r.next_step && <p>下一步：{r.next_step}</p>}
          {r.note && <p>備註：{r.note}</p>}
        </div>
      ))}
    </>
  );

  // ===== 車源 =====
  if (mode === 'partner') {
    if (!caseRow.viewing_at && !results.length) return null;
    return (
      <div className="case-section">
        <h3>看車結果</h3>
        {!closed && !open && (
          <button className="btn btn-dark btn-block" onClick={() => setOpen(true)}>回報看車結果</button>
        )}
        {open && (
          <div className="admin-form">
            <div className="quick">
              {RESULTS.map(([k, label]) => (
                <button key={k} aria-pressed={form.result === k} onClick={() => setForm({ ...form, result: k })}>{label}</button>
              ))}
            </div>
            <div className="field-grid">
              <label className="field"><span>客戶預算（元）</span><input inputMode="numeric" placeholder="例如 800000" {...set('budget')} /></label>
              <label className="field"><span>你的報價（元）</span><input inputMode="numeric" placeholder="例如 850000" {...set('quote')} /></label>
            </div>
            <label className="field"><span>客戶反應</span><input placeholder="例如：喜歡外觀，覺得價格偏高" {...set('reaction')} /></label>
            <label className="field"><span>客戶問題</span><input placeholder="例如：問保固、問貸款" {...set('questions')} /></label>
            <label className="field"><span>下一步</span><input placeholder="例如：客戶週末和家人討論" {...set('nextStep')} /></label>
            <label className="field"><span>備註</span><input {...set('note')} /></label>
            <p className="admin-muted">報價會留下紀錄，之後改價也會保留前一次的價格。</p>
            <div className="form-actions">
              <button className="btn btn-light" onClick={() => setOpen(false)} disabled={busy}>取消</button>
              <button className="btn btn-dark" onClick={submit} disabled={busy}>{busy ? '送出中…' : '送出結果'}</button>
            </div>
          </div>
        )}
        {msg && <p className="result-box">{msg}</p>}
        {results.length > 0 && <details className="viewing-history" open><summary>回報紀錄（{results.length}）</summary>{history}</details>}
      </div>
    );
  }

  // ===== 客服 =====
  if (!results.length && !caseRow.follow_up_at && !caseRow.viewing_at) return null;
  const warn = GUARANTEE_RE.test(draft);
  return (
    <div className="case-section">
      <h3>看車結果與跟進</h3>
      {!results.length && <p className="admin-muted">車源尚未回報看車結果。</p>}
      {latest && FOLLOW_RESULTS.includes(latest.result) && !caseRow.follow_up_at && !closed && (
        <p className="result-box">客戶目前「{RESULT_LABEL[latest.result]}」，建議設定下一次跟進日期。</p>
      )}
      {results.length > 0 && history}

      {!closed && (
        <>
          <h3 style={{ marginTop: 16 }}>下一次跟進</h3>
          <div className="field-grid">
            <label className="field"><span>跟進日期</span><input type="date" value={follow.date} onChange={(e) => setFollow({ ...follow, date: e.target.value })} /></label>
            <label className="field"><span>跟進重點</span><input placeholder="例如：問家人討論結果" value={follow.note} onChange={(e) => setFollow({ ...follow, note: e.target.value })} /></label>
          </div>
          <div className="inline-actions"><button onClick={saveFollow}>{follow.date ? '儲存跟進日期' : '取消跟進日期'}</button></div>

          {hasCustomerLine && (
            <>
              <label className="field" style={{ marginTop: 12 }}><span>LINE 跟進訊息</span>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
              </label>
              {warn && <p className="admin-error">訊息含有「保證」等字眼，系統不會送出。</p>}
              <div className="inline-actions">
                <button disabled={busy || warn} onClick={sendFollow}>{busy ? '傳送中…' : '用 LINE 傳跟進訊息'}</button>
              </div>
            </>
          )}
        </>
      )}
      {msg && <p className="result-box">{msg}</p>}
    </div>
  );
        }
