'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import {
  TOPICS, TOPIC_LABEL, Q_STATUS, CONDITION_WORDS, GUARANTEE_RE, DEFAULT_DISCLAIMER, fmtTime, buildCustomerReply,
} from '../../lib/questions';
import '../../styles/viewing.css';

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

// 車況確認（後台與車源頁共用）
// mode = 'staff'：建立問題、把車源回覆傳給客戶；mode = 'partner'：回覆問題
export default function QuestionsPanel({ caseRow, mode, isAdmin = false, hasCustomerLine = false, onChange }) {
  const [list, setList] = useState([]);
  const [lastMsg, setLastMsg] = useState('');
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [drafts, setDrafts] = useState({});
  const [disclaimer, setDisclaimer] = useState(DEFAULT_DISCLAIMER);
  const [editDisclaimer, setEditDisclaimer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const sb = getSupabase();
    const { data } = await sb.from('partner_questions').select('*').eq('case_id', caseRow.id).order('created_at', { ascending: false });
    setList(data || []);
    if (mode === 'staff') {
      const [ev, st] = await Promise.all([
        sb.from('case_events').select('body').eq('case_id', caseRow.id).eq('type', 'customer_msg').order('created_at', { ascending: false }).limit(1),
        sb.from('crm_settings').select('condition_disclaimer').eq('id', 1).maybeSingle(),
      ]);
      setLastMsg((ev.data && ev.data[0] && ev.data[0].body) || '');
      if (st.data && st.data.condition_disclaimer) setDisclaimer(st.data.condition_disclaimer);
    }
  }

  useEffect(() => {
    load();
  }, [caseRow.id, caseRow.last_activity_at]);

  async function run(fn, okText) {
    setBusy(true);
    setMsg('');
    try {
      const out = await fn();
      setMsg(typeof okText === 'function' ? okText(out) : okText);
      await load();
      if (onChange) onChange();
      return true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const open = list.filter((q) => q.status === 'open');
  const answered = list.filter((q) => q.status === 'answered');
  const done = list.filter((q) => ['sent', 'cancelled'].includes(q.status));
  const asking = mode === 'staff' && lastMsg && CONDITION_WORDS.test(lastMsg) && !open.length && !answered.length;

  function startForm() {
    setForm({ topic: 'condition', question: lastMsg.slice(0, 300), holdReply: hasCustomerLine });
  }

  async function create() {
    if (!form.question.trim()) return setMsg('請填寫客戶的問題');
    const ok = await run(() => api('/api/admin/questions', { action: 'create', caseId: caseRow.id, ...form }), (o) => `已建立車況確認。${o.note || ''}`);
    if (ok) setForm(null);
  }

  async function saveDisclaimer() {
    const { error } = await getSupabase().from('crm_settings').update({ condition_disclaimer: disclaimer.trim(), updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? '儲存失敗：' + error.message : '已儲存責任說明。');
    setEditDisclaimer(false);
  }

  // ===== 車源 =====
  if (mode === 'partner') {
    if (!list.length) return null;
    return (
      <div className="case-section">
        <h3>車況確認</h3>
        {open.map((q) => (
          <div className="question" key={q.id}>
            <p className="question-q"><span className="badge badge-new">{TOPIC_LABEL[q.topic]}</span> {q.question}</p>
            <textarea
              placeholder="請依實際狀況回覆，例如：無重大事故，右前葉子板有鈑金紀錄"
              value={answers[q.id] || ''}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            />
            <p className="admin-muted">你的回覆會記錄提供者與時間，送出後無法修改；如需更正，請在「回報進度」補充說明。</p>
            <button
              className="btn btn-dark btn-block"
              disabled={busy}
              onClick={() => run(() => api('/api/partner/case', { caseId: caseRow.id, action: 'answer', questionId: q.id, answer: answers[q.id] || '' }), '已送出回覆，VANTA 會轉達客戶。')}
            >
              {busy ? '送出中…' : '送出回覆'}
            </button>
          </div>
        ))}
        {msg && <p className="result-box">{msg}</p>}
        {list.filter((q) => q.status !== 'open').length > 0 && (
          <details className="viewing-history">
            <summary>已回覆的問題（{list.filter((q) => q.status !== 'open').length}）</summary>
            {list.filter((q) => q.status !== 'open').map((q) => (
              <div className="question-done" key={q.id}>
                <p>問：{q.question}</p>
                {q.answer ? <p>答：{q.answer}</p> : <p className="admin-muted">{Q_STATUS[q.status]}</p>}
                {q.answered_at && <p className="admin-muted">{fmtTime(q.answered_at)} 回覆</p>}
              </div>
            ))}
          </details>
        )}
      </div>
    );
  }

  // ===== 客服 =====
  return (
    <div className="case-section">
      <h3>車況確認</h3>

      {asking && (
        <p className="result-box">
          客戶最新訊息可能在問車況或交易條件。請勿自行回答或保證，按下方「請車源確認」。
        </p>
      )}

      {answered.map((q) => {
        const draft = drafts[q.id] ?? buildCustomerReply(q, disclaimer);
        const warn = GUARANTEE_RE.test(draft);
        return (
          <div className="question" key={q.id}>
            <p className="question-q"><span className="badge badge-ok">車源已回覆</span> {q.question}</p>
            <p className="question-a">{q.answer}</p>
            <p className="admin-muted">來源：{q.answered_by_label || '車源'}｜{fmtTime(q.answered_at)}</p>
            <textarea value={draft} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} style={{ minHeight: 180 }} />
            {warn && <p className="admin-error">內容含有「保證」等字眼，系統不會送出。請改用車源提供的資訊轉達。</p>}
            <div className="inline-actions">
              {hasCustomerLine && (
                <button disabled={busy || warn} onClick={() => run(() => api('/api/admin/questions', { action: 'send', questionId: q.id, text: draft }), '已用 LINE 回覆客戶。')}>
                  用 LINE 回覆客戶
                </button>
              )}
              <button
                disabled={busy || warn}
                onClick={() => {
                  if (navigator.clipboard) navigator.clipboard.writeText(draft).catch(() => {});
                  run(() => api('/api/admin/questions', { action: 'send', questionId: q.id, text: draft, viaLine: false }), '已複製內容並標記為已回覆客戶。');
                }}
              >
                複製並標記已回覆
              </button>
            </div>
          </div>
        );
      })}

      {open.map((q) => (
        <div className="question" key={q.id}>
          <p className="question-q"><span className="badge badge-new">等待車源回覆</span> {TOPIC_LABEL[q.topic]}：{q.question}</p>
          <p className="admin-muted">{q.created_by_label || '客服'}｜{fmtTime(q.created_at)} 建立</p>
          <div className="inline-actions">
            <button disabled={busy} onClick={() => confirm('取消這個車況確認？') && run(() => api('/api/admin/questions', { action: 'cancel', questionId: q.id }), '已取消。')}>取消</button>
          </div>
        </div>
      ))}

      {!form ? (
        <div className="case-actions">
          <button className="btn btn-light" onClick={startForm} disabled={!caseRow.partner_id}>＋ 請車源確認車況／交易條件</button>
        </div>
      ) : (
        <div className="admin-form">
          <div className="chips">
            {TOPICS.map(([k, label]) => (
              <button key={k} aria-pressed={form.topic === k} className={form.topic === k ? '' : 'off'} onClick={() => setForm({ ...form, topic: k })}>{label}</button>
            ))}
          </div>
          <label className="field"><span>客戶的問題</span>
            <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="例如：這台車有事故嗎？" />
          </label>
          {hasCustomerLine && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" style={{ width: 'auto', height: 'auto', margin: 0 }} checked={form.holdReply} onChange={(e) => setForm({ ...form, holdReply: e.target.checked })} />
              同時用 LINE 告訴客戶「我幫您確認一下」
            </label>
          )}
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={create} disabled={busy}>{busy ? '送出中…' : '送給車源確認'}</button>
          </div>
        </div>
      )}

      {msg && <p className="result-box">{msg}</p>}

      {done.length > 0 && (
        <details className="viewing-history">
          <summary>已完成的車況確認（{done.length}）</summary>
          {done.map((q) => (
            <div className="question-done" key={q.id}>
              <p>{TOPIC_LABEL[q.topic]}：{q.question}</p>
              {q.answer && <p>車源回覆：{q.answer}（{q.answered_by_label}｜{fmtTime(q.answered_at)}）</p>}
              <p className="admin-muted">{Q_STATUS[q.status]}{q.sent_at ? `｜${fmtTime(q.sent_at)}${q.sent_via === 'line' ? ' LINE' : ''}` : ''}</p>
            </div>
          ))}
        </details>
      )}

      {isAdmin && (
        <details className="viewing-history" open={editDisclaimer}>
          <summary>回覆客戶時附上的責任說明（所有案件共用）</summary>
          <textarea value={disclaimer} onChange={(e) => { setDisclaimer(e.target.value); setEditDisclaimer(true); }} />
          <p className="admin-muted">⚠️ 正式文字上線前請經法律顧問確認。</p>
          <div className="inline-actions"><button onClick={saveDisclaimer}>儲存說明</button></div>
        </details>
      )}
    </div>
  );
            }
