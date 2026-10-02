'use client';

import { useEffect, useState } from 'react';
import AdminShell, { useRole } from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { site } from '../../../lib/site';

export default function PartnersPage() {
  return (
    <AdminShell adminOnly>
      <Partners />
    </AdminShell>
  );
}

const EMPTY = { name: '', phone: '', line_id: '', company: '', role_title: '', notes: '', active: true };
const ROLE_LABEL = { admin: '管理員', staff: '客服', partner: '合作車源' };

function Partners() {
  const { session } = useRole();
  const [partners, setPartners] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bind, setBind] = useState(null);

  async function load() {
    const sb = getSupabase();
    const [p, a] = await Promise.all([
      sb.from('partners').select('*, cars(id), cases(id, status)').order('name'),
      sb.from('profiles').select('*').order('created_at'),
    ]);
    if (p.error) return alert('讀取失敗：' + p.error.message);
    setPartners(p.data);
    setAccounts(a.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function savePartner() {
    if (!editing.name.trim()) return alert('請填寫名稱');
    const row = {
      name: editing.name.trim(),
      phone: editing.phone.trim() || null,
      line_id: editing.line_id.trim().replace(/^~/, '') || null,
      company: editing.company.trim() || null,
      role_title: editing.role_title.trim() || null,
      notes: editing.notes.trim() || null,
      active: !!editing.active,
      updated_at: new Date().toISOString(),
    };
    setBusy(true);
    const sb = getSupabase();
    const { error } = editing.id
      ? await sb.from('partners').update(row).eq('id', editing.id)
      : await sb.from('partners').insert(row);
    setBusy(false);
    if (error) return alert('儲存失敗：' + error.message);
    setEditing(null);
    load();
  }

  async function callAccounts(method, body) {
    const res = await fetch('/api/admin/accounts', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '操作失敗');
  }

  async function makeBindCode(p) {
    const res = await fetch('/api/admin/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'bind_code', partnerId: p.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || '產生失敗');
    setBind({ partnerId: p.id, name: p.name, code: data.code });
  }

  async function createAccount() {
    setBusy(true);
    try {
      await callAccounts('POST', account);
      setAccount(null);
      alert('帳號已建立，請把 Email 和密碼交給對方，登入網址是 /partner');
      load();
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  }

  async function removeAccount(a) {
    if (!confirm(`停用 ${a.email || a.display_name} 的帳號？對方將無法再登入。`)) return;
    try {
      await callAccounts('DELETE', { userId: a.user_id });
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  const set = (k) => ({ value: editing[k], onChange: (e) => setEditing({ ...editing, [k]: e.target.value }) });
  const setA = (k) => ({ value: account[k], onChange: (e) => setAccount({ ...account, [k]: e.target.value }) });
  const partnerName = (id) => ((partners || []).find((p) => p.id === id) || {}).name || '';

  return (
    <>
      <div className="admin-row-head">
        <h1>合作車源</h1>
        <button className="btn btn-dark btn-sm" onClick={() => setEditing({ id: null, ...EMPTY })}>＋ 新增車源</button>
      </div>
      <p className="admin-muted">車輛可以指定車源負責人，客戶詢問那台車時，案件會自動帶出要轉交給誰。</p>

      {editing && (
        <div className="admin-form">
          <h3>{editing.id ? '編輯車源' : '新增車源'}</h3>
          <div className="field-grid">
            <label className="field"><span>名稱</span><input placeholder="例如 阿明" {...set('name')} /></label>
            <label className="field"><span>公司／車行</span><input {...set('company')} /></label>
            <label className="field"><span>電話</span><input inputMode="tel" {...set('phone')} /></label>
            <label className="field"><span>LINE ID</span><input {...set('line_id')} /></label>
            <label className="field"><span>職稱</span><input {...set('role_title')} /></label>
            <label className="field"><span>狀態</span>
              <select value={editing.active ? '1' : '0'} onChange={(e) => setEditing({ ...editing, active: e.target.value === '1' })}>
                <option value="1">合作中</option>
                <option value="0">暫停</option>
              </select>
            </label>
          </div>
          <label className="field"><span>備註</span><textarea {...set('notes')} /></label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setEditing(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={savePartner} disabled={busy}>儲存</button>
          </div>
        </div>
      )}

      {!partners && <p className="admin-muted">載入中…</p>}
      {partners && partners.length === 0 && <p className="admin-muted">還沒有合作車源。</p>}
      {(partners || []).map((p) => (
        <div className="case-card" key={p.id}>
          <div className="case-card-top">
            <span className="case-no">{p.company || '合作車源'}</span>
            <span className={`badge ${p.active ? 'badge-ok' : 'badge-off'}`}>{p.active ? '合作中' : '暫停'}</span>
          </div>
          <h3>{p.name}</h3>
          <p className="lead-meta">
            {[p.phone, p.line_id && `LINE：${p.line_id}`].filter(Boolean).join('｜') || '未填聯絡方式'}
            <br />
            車輛 {(p.cars || []).length} 台｜進行中案件 {(p.cases || []).filter((c) => !['won', 'lost', 'cancelled'].includes(c.status)).length} 件
            <br />
            {p.line_user_id ? <span className="badge badge-ok">LINE 已綁定，轉交案件會自動通知</span> : <span className="badge badge-mid">LINE 未綁定</span>}
          </p>
          <div className="inline-actions">
            <button onClick={() => setEditing({ id: p.id, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? EMPTY[k]])) })}>編輯</button>
            <button onClick={() => setAccount({ role: 'partner', partnerId: p.id, displayName: p.name, email: '', password: '' })}>建立登入帳號</button>
            <button onClick={() => makeBindCode(p)}>{p.line_user_id ? '重新綁定 LINE' : '綁定 LINE'}</button>
          </div>
          {bind && bind.partnerId === p.id && (
            <div className="result-box">
              請 {bind.name} 先加入 VANTA 官方帳號好友（{site.lineId}），再傳送這組綁定碼：
              <strong style={{ display: 'block', margin: '8px 0', fontSize: 20, letterSpacing: '.08em' }}>{bind.code}</strong>
              <div className="inline-actions">
                <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(`請加入 VANTA MOTORS 官方帳號：${site.lineUrl}\n加入後傳送這組綁定碼：${bind.code}`)}>複製給車源的說明</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="admin-row-head" style={{ marginTop: 40 }}>
        <h1>登入帳號</h1>
        <button className="btn btn-light btn-sm" onClick={() => setAccount({ role: 'staff', partnerId: '', displayName: '', email: '', password: '' })}>＋ 新增員工</button>
      </div>
      <p className="admin-muted">管理員看得到全部；客服看得到案件與客戶，但看不到成本與分潤；合作車源只看得到自己的案件。</p>

      {account && (
        <div className="admin-form">
          <h3>建立{ROLE_LABEL[account.role]}帳號{account.role === 'partner' ? `（${partnerName(account.partnerId)}）` : ''}</h3>
          {account.role !== 'partner' && (
            <label className="field"><span>角色</span>
              <select {...setA('role')}>
                <option value="staff">客服</option>
                <option value="admin">管理員</option>
              </select>
            </label>
          )}
          <label className="field"><span>顯示名稱</span><input {...setA('displayName')} /></label>
          <label className="field"><span>登入 Email</span><input type="email" autoComplete="off" {...setA('email')} /></label>
          <label className="field"><span>初始密碼（至少 8 個字元）</span><input type="text" autoComplete="off" {...setA('password')} /></label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setAccount(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={createAccount} disabled={busy}>{busy ? '建立中…' : '建立帳號'}</button>
          </div>
        </div>
      )}

      {accounts.map((a) => (
        <div className="case-card" key={a.user_id}>
          <div className="case-card-top">
            <span className="case-no">{a.email || '—'}</span>
            <span className="badge badge-mid">{ROLE_LABEL[a.role]}</span>
          </div>
          <h3>{a.display_name || '未命名'}{a.partner_id ? `｜${partnerName(a.partner_id)}` : ''}</h3>
          {a.user_id !== session.user.id && (
            <div className="inline-actions"><button className="danger" onClick={() => removeAccount(a)}>停用帳號</button></div>
          )}
        </div>
      ))}
    </>
  );
        }
