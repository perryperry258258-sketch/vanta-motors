'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext } from 'react';
import { Login, useAuthProfile } from '../admin/AdminShell';
import { getSupabase } from '../../lib/supabase';
import '../../styles/buyback-admin.css';
import '../../styles/crm.css';
import '../../styles/deal.css';

const PartnerContext = createContext({ session: null, profile: null });

export function usePartner() {
  return useContext(PartnerContext);
}

const NAV = [
  ['/partner', '我的案件'],
  ['/partner/cars', '我的車輛'],
];

export default function PartnerShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, profile, loading } = useAuthProfile();

  if (loading) return <main className="admin"><p className="admin-muted">載入中…</p></main>;
  if (!session) return <Login title="合作夥伴登入" />;

  const signOut = () => getSupabase().auth.signOut();

  if (!profile || profile.role !== 'partner' || !profile.partner_id) {
    return (
      <main className="admin">
        <h1>這裡是合作車源專用頁面</h1>
        {profile && profile.role !== 'partner' && (
          <p className="admin-muted">你是 VANTA 內部帳號，請到 <Link href="/admin" className="text-link">後台</Link>。</p>
        )}
        <button className="btn btn-light btn-sm" style={{ marginTop: 20 }} onClick={signOut}>登出</button>
      </main>
    );
  }

  const current = (href) => (href === '/partner' ? pathname === '/partner' || pathname.startsWith('/partner/cases') : pathname.startsWith(href));

  return (
    <PartnerContext.Provider value={{ session, profile }}>
      <main className="admin">
        <div className="partner-top">
          <Link href="/partner" className="partner-brand">
            VANTA MOTORS
            <small>合作夥伴｜{profile.display_name || ''}</small>
          </Link>
          <button className="btn btn-light btn-sm" onClick={signOut}>登出</button>
        </div>
        <nav className="tabs" style={{ marginTop: -8, marginBottom: 20 }}>
          {NAV.map(([href, label]) => (
            <button key={href} type="button" aria-pressed={current(href)} onClick={() => router.push(href)}>{label}</button>
          ))}
        </nav>
        {children}
      </main>
    </PartnerContext.Provider>
  );
}
