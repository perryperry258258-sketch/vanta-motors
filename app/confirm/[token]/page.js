import Logo from '../../../components/Logo';
import ConfirmButtons from '../../../components/ConfirmButtons';
import { getAdminSupabase } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

async function loadConfirmation(token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = getAdminSupabase();
  const { data } = await db
    .from('customer_confirmations')
    .select('token, response, expires_at, case:cases(case_no, subject)')
    .eq('token', token)
    .maybeSingle();
  return data;
}

export default async function ConfirmPage({ params }) {
  const { token } = await params;
  let row = null;
  try {
    row = await loadConfirmation(token);
  } catch (e) {
    console.error(e);
  }
  const expired = row && new Date(row.expires_at) < new Date();

  return (
    <main className="confirm-page">
      <Logo />
      <div style={{ marginTop: 40 }}>
        {!row || expired ? (
          <>
            <h1>這個確認連結已失效</h1>
            <p className="lead">如果需要協助，歡迎直接透過 LINE 聯絡 VANTA MOTORS。</p>
            <p className="lead">This confirmation link is no longer valid.</p>
          </>
        ) : (
          <>
            <h1>感謝您透過 VANTA MOTORS 找到愛車。</h1>
            <p className="lead">為完成本次服務紀錄，請協助確認您的購車案件。</p>
            <p className="lead" style={{ fontSize: 14 }}>Please help us confirm the status of your purchase.</p>
            <div className="confirm-case">
              <p>案件編號 Case No.</p>
              <strong>{row.case && row.case.case_no}</strong>
              <p style={{ marginTop: 14 }}>車輛 Vehicle</p>
              <strong>{(row.case && row.case.subject) || '—'}</strong>
            </div>
            <ConfirmButtons token={row.token} answered={row.response} />
          </>
        )}
      </div>
    </main>
  );
}
