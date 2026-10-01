'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

export default function AdminShell({ children }) {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <main className="admin"><p className="admin-muted">載入中…</p></main>;
  }
  if (!session) return <Login />;

  return (
    <main className="admin">
      <div className="admin-top">
        <Link href="/admin">← 車輛管理</Link>
        <button className="btn btn-light btn-sm" onClick={() => getSupabase().auth.signOut()}>登出</button>
      </div>
      {children}
    </main>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError('Email 或密碼不正確，請再試一次。');
    setBusy(false);
  }

  return (
    <main className="admin">
      <form className="login" onSubmit={submit}>
        <h1>後台登入</h1>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>密碼</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="admin-error">{error}</p>}
        <button className="btn btn-dark btn-block" style={{ marginTop: 24 }} disabled={busy}>
          {busy ? '登入中…' : '登入'}
        </button>
      </form>
    </main>
  );
}
