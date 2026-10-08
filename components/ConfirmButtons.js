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
        <strong>{result === 'confirmed' ? '恭喜您迎接新車 🎉' : '收到，謝謝您告訴我們。'}</strong>
        <p style={{ marginTop: 8, lineHeight: 1.8 }}>
          {result === 'confirmed'
            ? '謝謝您讓 VANTA MOTORS 陪您完成這次找車，祝您行車平安、用車愉快！之後不論是保養問題、想換車或賣車，或是身邊朋友在找車，都歡迎隨時在 LINE 找我們。'
            : '如果還在考慮，或有任何想再確認的地方，隨時在 LINE 跟我們說，我們會繼續陪您找到合適的車。'}
        </p>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--mute)' }}>
          {result === 'confirmed' ? 'Congratulations on your new car! Thank you for choosing VANTA MOTORS.' : "Thank you for letting us know. We're here whenever you need us."}
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
