'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import '../../styles/viewing.css';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const CLOSED = ['won', 'lost', 'cancelled'];

// 台灣時間顯示，例如「10/4（六）14:00」
export function fmtSlot(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(value)).map((p) => [p.type, p.value])
  );
  const wd = WEEK[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)];
  return `${parts.month}/${parts.day}（${wd}）${parts.hour}:${parts.minute}`;
}

const STATUS = { proposed: '等待客戶確認', chosen: '已預約', expired: '未選擇', cancelled: '已取消' };

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

// 看車安排（後台與車源頁共用）
// mode = 'staff'：客服可重新傳送時間、代客戶確認；mode = 'partner'：車源提供 1～3 個時間
export default function ViewingPanel({ caseRow, mode, isAdmin = false, onChange }) {
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [notice, setNotice] = useState(null);

  async function load() {
    const { data } = await getSupabase().from('viewing_slots').select('*').eq('case_id', caseRow.id).order('slot_at');
    setSlots(data || []);
  }

  useEffect(() => {
    load();
    if (mode === 'staff' && isAdmin) {
      getSupabase().from('crm_settings').select('viewing_notice').eq('id', 1).maybeSingle()
        .then(({ data }) => setNotice({ text: (data && data.viewing_notice) || '', open: false }));
    }
  }, [caseRow.id, caseRow.viewing_at, caseRow.status]);

  const closed = CLOSED.includes(caseRow.status);
  const accepted = caseRow.partner_response === 'accepted' || !caseRow.partner_response;
  const proposed = slots.filter((s) => s.status === 'proposed');
  const history = slots.filter((s) => s.status !== 'proposed');
  const upcoming = caseRow.viewing_at && new Date(caseRow.viewing_at) > new Date();

  async function run(fn, okText) {
    setBusy(true);
    setMsg('');
    try {
      const out = await fn();
      setMsg(typeof okText === 'function' ? okText(out) : okText);
      await load();
      if (onChange) onChange();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  function propose() {
    const values = form.filter(Boolean).map((v) => new Date(v).toISOString());
    if (!values.length) return setMsg('請至少填一個看車時間');
    run(
      () => api('/api/partner/case', { caseId: caseRow.id, action: 'propose', slots: values }),
      (out) => (out.sent ? '已送出，VANTA 已用 LINE 請客戶選擇時間。客戶選好會通知你。' : '已送出，VANTA 客服會聯絡客戶確認時間。')
    );
    setForm(['', '', '']);
  }

  async function saveNotice() {
    const { error } = await getSupabase().from('crm_settings').update({ viewing_notice: notice.text.trim(), updated_at: new Date().toISOString() }).eq('id', 1);
    setMsg(error ? '儲存失敗：' + error.message : '已儲存預約成功說明。');
  }

  return (
    <div className="case-section viewing">
      <h3>看車安排</h3>

      {caseRow.viewing_at && (
        <p className={`viewing-booked${upcoming ? '' : ' past'}`}>
          {upcoming ? '🟢 已預約看車' : '看車時間'}：{fmtSlot(caseRow.viewing_at)}
        </p>
      )}

      {proposed.length > 0 && (
        <>
          <p className="admin-muted">已提供給客戶的時間，等待客戶確認：</p>
          <ul className="viewing-slots">
            {proposed.map((s) => (
              <li key={s.id}>
                <span>{fmtSlot(s.slot_at)}</span>
                {mode === 'staff' && (
                  <button
                    disabled={busy}
                    onClick={() => confirm(`確認客戶選擇 ${fmtSlot(s.slot_at)}？會通知車源並建立預約。`) &&
                      run(() => api('/api/admin/viewing', { action: 'choose', slotId: s.id }), '已建立看車預約並通知車源。')}
                  >
                    客戶選這個
                  </button>
                )}
              </li>
            ))}
          </ul>
          {mode === 'staff' && (
            <div className="inline-actions">
              <button disabled={busy} onClick={() => run(() => api('/api/admin/viewing', { action: 'resend', caseId: caseRow.id }), (o) => (o.sent ? '已重新用 LINE 傳送給客戶。' : o.reason || '未傳送'))}>
                重新用 LINE 傳給客戶
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'staff' && !proposed.length && !caseRow.viewing_at && (
        <p className="admin-muted">
          {caseRow.partner_response === 'pending' ? '等待車源接案。' : caseRow.partner_response === 'declined' ? '車源無法配合，請改派其他車源。' : '車源尚未提供看車時間。'}
        </p>
      )}

      {mode === 'partner' && accepted && !closed && (
        <div className="viewing-form">
          <p className="admin-muted">
            {caseRow.viewing_at ? '需要改時間時，可以重新提供時間，客戶確認後會更新預約。' : '提供 1～3 個方便的看車時間，VANTA 會用 LINE 請客戶選擇。'}
          </p>
          {form.map((v, i) => (
            <input
              key={i}
              type="datetime-local"
              value={v}
              onChange={(e) => setForm(form.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`看車時間 ${i + 1}`}
            />
          ))}
          <button className="btn btn-dark btn-block" disabled={busy} onClick={propose}>
            {busy ? '送出中…' : proposed.length ? '重新提供看車時間' : '送出看車時間'}
          </button>
          <p className="admin-muted">客戶的聯絡方式由 VANTA 統一處理，不會提供給你，你的聯絡方式也不會提供給客戶。</p>
        </div>
      )}

      {msg && <p className="result-box">{msg}</p>}

      {history.length > 0 && (
        <details className="viewing-history">
          <summary>過去提供的時間（{history.length}）</summary>
          <ul className="viewing-slots">
            {history.map((s) => (
              <li key={s.id}>
                <span>{fmtSlot(s.slot_at)}</span>
                <span className="admin-muted">{STATUS[s.status]}{s.chosen_via === 'staff' ? '（客服確認）' : s.chosen_via === 'line' ? '（客戶 LINE）' : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {notice && (
        <details className="viewing-history" open={notice.open}>
          <summary>預約成功後傳給客戶的說明（所有案件共用）</summary>
          <textarea value={notice.text} onChange={(e) => setNotice({ ...notice, text: e.target.value, open: true })} />
          <p className="admin-muted">⚠️ 正式文字上線前請經法律顧問確認。</p>
          <div className="inline-actions"><button onClick={saveNotice}>儲存說明</button></div>
        </details>
      )}
    </div>
  );
}
