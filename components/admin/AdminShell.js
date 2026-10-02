'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import '../../styles/buyback-admin.css';
import '../../styles/crm.css';
import '../../styles/deal.css';

// roles: 這個項目哪些角色看得到
const NAV = [
  ['/admin/overview', '營運總覽', ['admin']],
  ['/admin/cases', '案件', ['admin', 'staff']],
  ['/admin/find', '找車需求', ['admin', 'staff']],
  ['/admin/customers', '客戶', ['admin', 'staff']],
  ['/admin', '車輛管理', ['admin', 'staff']],
  ['/admin/buyback/leads', '收車線索', ['admin', 'staff']],
  ['/admin/partners', '車源與帳號', ['admin']],
  ['/admin/buyback', '收車總覽', ['admin']],
  ['/admin/buyback/pricing', '行情規則', ['admin']],
  ['/admin/buyback/catalog', '品牌與係數', ['admin']],
];

const RoleContext = createContext({ role: null, profile: null, session: null });

export function useRole() {
  return useContext(RoleContext);
}

// 共用的登入狀態：session 與角色資料
export function useAuthProfile() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(session === null ? null : undefined);
      return;
    }
    getSupabase()
      .from('profiles')
      .select('role, display_name, partner_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data || null));
  }, [session]);

  const loading = session === undefined || (session && profile === undefined);
  return { session, profile, loading };
}

export default function AdminShell({ children, adminOnly = false }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, loading } = useAuthProfile();
  const role = profile && profile.role;

  useEffect(() => {
    if (role === 'partner') router.replace('/partner');
  }, [role, router]);

  if (loading) return <main className="admin"><p className="admin-muted">載入中…</p></main>;
  if (!session) return <Login />;

  const signOut = () => getSupabase().auth.signOut();

  if (!role || role === 'partner') {
    return (
      <main className="admin">
        <h1>{role === 'partner' ? '前往合作夥伴頁面…' : '這個帳號尚未設定權限'}</h1>
        {!role && <p className="admin-muted">請聯絡 VANTA 管理員設定帳號權限。</p>}
        <button className="btn btn-light btn-sm" style={{ marginTop: 20 }} onClick={signOut}>登出</button>
      </main>
    );
  }

  const blocked = adminOnly && role !== 'admin';

  return (
    <RoleContext.Provider value={{ role, profile, session }}>
      <main className="admin">
        <div className="admin-top">
          <nav className="admin-nav">
            {NAV.filter(([, , roles]) => roles.includes(role)).map(([href, label]) => (
              <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
          <button className="btn btn-light btn-sm" onClick={signOut}>登出</button>
        </div>
        {blocked ? <p className="admin-error">這個頁面只有管理員可以使用。</p> : children}
      </main>
    </RoleContext.Provider>
  );
}

export function Login({ title = '後台登入' }) {
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
        <h1>{title}</h1>
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
