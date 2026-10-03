'use client';

import { useState } from 'react';
import AdminShell, { useRole } from '../../../components/admin/AdminShell';

export default function SecurityPage() {
  return (
    <AdminShell adminOnly>
      <Security />
    </AdminShell>
  );
}

function Security() {
  const { session } = useRole();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [error, setError] = useState('');

  async function run() {
    if (!confirm('會建立臨時測試帳號與測試資料，測完自動刪除，大約需要 20～40 秒。確定執行？')) return;
    setBusy(true);
    setError('');
    setOut(null);
    try {
      const res = await fetch('/api/admin/security-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `執行失敗（${res.status}）`);
      setOut(data);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <h1>權限安全測試</h1>
      <p className="admin-muted">
        系統會建立兩個臨時車源帳號（A、B）和一個臨時客服帳號，用他們真正的登入身分，嘗試讀取、修改不屬於自己的資料，
        確認全部被資料庫或伺服器擋下。測完會自動刪除所有臨時帳號與測試資料，不影響正式資料。
      </p>
      <div className="case-actions">
        <button className="btn btn-dark" onClick={run} disabled={busy}>{busy ? '測試中，請稍候…' : '執行安全測試'}</button>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {out && (
        <div className="admin-card">
          <h3>結果：{out.passed} / {out.total} 通過</h3>
          <ul className="rank">
            {out.results.map((r) => (
              <li key={`${r.no}-${r.name}`} style={{ display: 'block' }}>
                <span>{r.pass ? '✅' : '❌'} {r.no > 0 && r.no < 99 ? `${r.no}. ` : ''}{r.name}</span>
                {r.detail && <><br /><span className="admin-muted">{r.detail}</span></>}
              </li>
            ))}
          </ul>
          <p className="admin-muted">測試代號：{out.tag}</p>
        </div>
      )}
    </>
  );
}
