'use client';

import { useEffect, useState } from 'react';
import AdminShell, { useRole } from '../../../components/admin/AdminShell';

export default function NotifyPage() {
  return (
    <AdminShell>
      <Notify />
    </AdminShell>
  );
}

// 每日 LINE 提醒：綁定自己的 LINE 後，每天早上 9 點收到待跟進案件
function Notify() {
  const { session } = useRole();
  const [state, setState] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (method, body) => {
    const res = await fetch('/api/admin/notify', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || '操作失敗');
    return out;
  };

  async function load() {
    try {
      setState(await call('GET'));
    } catch (e) {
      setMsg(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(action, okText) {
    setBusy(true);
    setMsg('');
    try {
      const out = await call('POST', { action });
      setMsg(typeof okText === 'function' ? okText(out) : okText);
      await load();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <h1>LINE 每日提醒</h1>
      <p className="admin-muted">
        綁定你自己的 LINE 後，每天早上 9 點會收到：今天要跟進的案件、待回覆客戶、尚未指派車源、成交資料不一致的數量。沒有事情要提醒的日子不會傳。
      </p>
      {!state && <p className="admin-muted">載入中…</p>}
      {state && (
        <div className="admin-card">
          <h3>{state.bound ? '✅ 已綁定 LINE' : '尚未綁定 LINE'}</h3>
          {!state.bound && (
            <>
              {state.code ? (
                <>
                  <p className="value">你的綁定碼：<strong>{state.code}</strong></p>
                  <p className="admin-muted">用你的 LINE 加 VANTA 官方帳號好友，把這串綁定碼傳給官方帳號，收到「綁定完成」後重新整理這頁。</p>
                </>
              ) : (
                <p className="admin-muted">先產生綁定碼。</p>
              )}
              <div className="inline-actions">
                <button disabled={busy} onClick={() => act('code', (o) => `綁定碼：${o.code}`)}>{state.code ? '重新產生綁定碼' : '產生綁定碼'}</button>
              </div>
            </>
          )}
          {state.bound && (
            <div className="inline-actions">
              <button disabled={busy} onClick={() => act('test', '已傳送今日提醒到你的 LINE。')}>現在傳一次今日提醒</button>
              <button disabled={busy} onClick={() => confirm('解除綁定後就不會收到提醒，確定？') && act('unbind', '已解除綁定。')}>解除綁定</button>
            </div>
          )}
          {msg && <p className="result-box">{msg}</p>}
        </div>
      )}
      {state && (
        <div className="admin-card">
          <h3>LINE 本月訊息用量</h3>
          {state.quota && state.quota.limit ? (
            <>
              <p className="value">
                已用 {state.quota.used.toLocaleString('en-US')}／{state.quota.limit.toLocaleString('en-US')} 則（{Math.round(state.quota.ratio * 100)}%）
              </p>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: `${Math.min(100, Math.round(state.quota.ratio * 100))}%`, height: '100%', background: state.quota.ratio >= 0.8 ? '#a1281e' : 'var(--black)' }} />
              </div>
              <p className="admin-muted" style={{ marginTop: 8 }}>
                只有主動推播（通知業務、傳看車時間、提醒、成交確認）會計入；回覆客人訊息不計入。用到 80% 時，每日提醒會出現警告。
              </p>
            </>
          ) : state.quota ? (
            <p className="value">已用 {state.quota.used.toLocaleString('en-US')} 則（目前方案沒有上限）</p>
          ) : (
            <p className="admin-muted">暫時讀不到用量，請確認 LINE 設定。</p>
          )}
        </div>
      )}
      {state && (
        <div className="admin-card">
          <h3>今日提醒預覽</h3>
          <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 14 }}>{state.preview}</pre>
        </div>
      )}
    </>
  );
}
