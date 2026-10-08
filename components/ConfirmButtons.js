'use client';

import { useState } from 'react';

export default function ConfirmButtons({ token, answered }) {
  const [result, setResult] = useState(answered || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function answer(response) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, response }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'error');
      setResult(data.response || response);
    } catch {
      setError('送出失敗，請稍後再試，或直接透過 LINE 告訴我們。');
    }
    setBusy(false);
  }

  if (result) {
    return (
      <div className="confirm-case" style={{ background: 'var(--white)', border: '1px solid var(--line)' }}>
        <strong>{result === 'confirmed' ? '已收到您的確認，謝謝。' : '已收到，我們會再與您聯繫。'}</strong>
        <p style={{ marginTop: 6 }}>
          {result === 'confirmed' ? 'Thank you for confirming.' : "Thank you. We'll be in touch."}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="lead" style={{ marginTop: 28 }}>請問是否已完成購車？</p>
      <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: "var(--mute)" }}>此確認主要用於 VANTA 的服務紀錄及案件管理，不取代您與實際車輛提供者簽署的買賣契約或其他交易文件。</p>
      <div className="confirm-actions">
        <button className="btn btn-dark" disabled={busy} onClick={() => answer('confirmed')}>
          是，已成交
          <small>Yes, I Purchased the Vehicle</small>
        </button>
        <button className="btn btn-light" disabled={busy} onClick={() => answer('denied')}>
          尚未成交
          <small>Not Yet Purchased</small>
        </button>
      </div>
      {error && <p className="lead" style={{ color: '#a1281e' }}>{error}</p>}
    </>
  );
}
