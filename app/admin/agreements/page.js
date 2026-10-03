'use client';

import { useEffect, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import '../../../styles/viewing.css';

export default function AgreementsPage() {
  return (
    <AdminShell adminOnly>
      <Agreements />
    </AdminShell>
  );
}

const BUCKET = 'partner-docs';
const STATUS = [['active', '合作中'], ['paused', '暫停'], ['ended', '已結束']];
const STATUS_LABEL = Object.fromEntries(STATUS);
const today = () => new Date().toISOString().slice(0, 10);
const pct = (v) => `${Math.round(Number(v) * 1000) / 10}%`;

function Agreements() {
  const [partners, setPartners] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [defaultShare, setDefaultShare] = useState(0.5);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const sb = getSupabase();
    const [p, a, s] = await Promise.all([
      sb.from('partners').select('id, name, active, company_name, contact_person, contact_phone, coop_start, coop_status').order('name'),
      sb.from('partner_agreements').select('*').order('created_at', { ascending: false }),
      sb.from('crm_settings').select('vanta_share').eq('id', 1).maybeSingle(),
    ]);
    if (p.error) return setError('讀取失敗：' + p.error.message);
    setPartners(p.data || []);
    setAgreements(a.data || []);
    if (s.data) setDefaultShare(Number(s.data.vanta_share));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <h1>合作協議</h1>
      <p className="admin-muted">
        記錄每位車源的合作資料、分潤比例與協議版本，可上傳協議文件。系統只提供管理與紀錄，不會產生合約；正式合作協議請由律師確認。
      </p>
      <p className="admin-muted">
        沒有設定協議的車源，結算時使用預設分潤：VANTA {pct(defaultShare)}（可在營運總覽調整）。設定「目前版本」後，之後新計算的待結算案件會改用協議的比例。
      </p>
      {error && <p className="admin-error">{error}</p>}
      {!partners && !error && <p className="admin-muted">載入中…</p>}
      {(partners || []).map((p) => {
        const list = agreements.filter((a) => a.partner_id === p.id);
        const current = list.find((a) => a.is_current);
        return (
          <div className="admin-card" key={p.id}>
            <div className="case-card-top">
              <h3>{p.name}{p.company_name ? `｜${p.company_name}` : ''}</h3>
              <span className={`badge badge-${p.coop_status === 'active' ? 'ok' : p.coop_status === 'paused' ? 'warn' : 'off'}`}>{STATUS_LABEL[p.coop_status] || '合作中'}</span>
            </div>
            <p className="lead-meta">
              {current ? `目前協議：${current.version}｜VANTA ${pct(current.vanta_share)}・車源 ${pct(1 - current.vanta_share)}` : `尚未設定協議（使用預設 VANTA ${pct(defaultShare)}）`}
            </p>
            <div className="inline-actions">
              <button onClick={() => setOpenId(openId === p.id ? null : p.id)}>{openId === p.id ? '收合' : '管理'}</button>
            </div>
            {openId === p.id && <PartnerDetail partner={p} list={list} defaultShare={defaultShare} onChange={load} />}
          </div>
        );
      })}
    </>
  );
}

function PartnerDetail({ partner, list, defaultShare, onChange }) {
  const [info, setInfo] = useState({
    company_name: partner.company_name || '',
    contact_person: partner.contact_person || '',
    contact_phone: partner.contact_phone || '',
    coop_start: partner.coop_start || '',
    coop_status: partner.coop_status || 'active',
  });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function saveInfo() {
    const { error } = await getSupabase()
      .from('partners')
      .update({ ...info, coop_start: info.coop_start || null, updated_at: new Date().toISOString() })
      .eq('id', partner.id);
    setMsg(error ? '儲存失敗：' + error.message : '已儲存合作資料。');
    if (!error) onChange();
  }

  async function addAgreement() {
    const share = Number(form.share) / 100;
    if (!form.version.trim()) return setMsg('請填寫協議版本，例如 v1.0');
    if (!(share >= 0 && share <= 1)) return setMsg('VANTA 分潤比例請填 0～100');
    setBusy(true);
    setMsg('');
    try {
      const sb = getSupabase();
      let filePath = null;
      if (form.file) {
        const ext = (form.file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
        filePath = `${partner.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).upload(filePath, form.file, { contentType: form.file.type || 'application/pdf' });
        if (error) throw error;
      }
      if (form.current) {
        const { error } = await sb.from('partner_agreements').update({ is_current: false }).eq('partner_id', partner.id).eq('is_current', true);
        if (error) throw error;
      }
      const { error } = await sb.from('partner_agreements').insert({
        partner_id: partner.id,
        version: form.version.trim(),
        agreement_date: form.agreementDate || null,
        effective_date: form.effectiveDate || null,
        vanta_share: share,
        cost_rules: form.costRules.trim() || null,
        other_terms: form.otherTerms.trim() || null,
        notes: form.notes.trim() || null,
        file_path: filePath,
        is_current: form.current,
      });
      if (error) throw error;
      setForm(null);
      setMsg('已新增協議。');
      onChange();
    } catch (e) {
      setMsg('新增失敗：' + (e.message || e));
    }
    setBusy(false);
  }

  async function makeCurrent(a) {
    if (!confirm(`將「${a.version}」設為目前協議？之後新計算的待結算案件會使用 VANTA ${pct(a.vanta_share)}。`)) return;
    const sb = getSupabase();
    const { error: e1 } = await sb.from('partner_agreements').update({ is_current: false }).eq('partner_id', partner.id).eq('is_current', true);
    const { error: e2 } = e1 ? { error: e1 } : await sb.from('partner_agreements').update({ is_current: true }).eq('id', a.id);
    setMsg(e2 ? '設定失敗：' + e2.message : `已將 ${a.version} 設為目前協議。`);
    onChange();
  }

  async function openFile(a) {
    const { data, error } = await getSupabase().storage.from(BUCKET).createSignedUrl(a.file_path, 600);
    if (error) return setMsg('開啟失敗：' + error.message);
    window.open(data.signedUrl, '_blank');
  }

  const setI = (k) => ({ value: info[k], onChange: (e) => setInfo({ ...info, [k]: e.target.value }) });
  const setF = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div style={{ marginTop: 14 }}>
      <h3>合作資料</h3>
      <div className="field-grid">
        <label className="field"><span>公司／商號</span><input {...setI('company_name')} /></label>
        <label className="field"><span>聯絡人</span><input {...setI('contact_person')} /></label>
        <label className="field"><span>聯絡電話</span><input inputMode="tel" {...setI('contact_phone')} /></label>
        <label className="field"><span>合作開始日期</span><input type="date" {...setI('coop_start')} /></label>
        <label className="field"><span>合作狀態</span>
          <select {...setI('coop_status')}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>
      <div className="inline-actions"><button onClick={saveInfo}>儲存合作資料</button></div>

      <h3 style={{ marginTop: 18 }}>協議版本</h3>
      {list.length === 0 && <p className="admin-muted">尚未建立協議。</p>}
      {list.map((a) => (
        <div className="question-done" key={a.id}>
          <p>
            <strong>{a.version}</strong>
            {a.is_current && <span className="badge badge-ok" style={{ marginLeft: 8 }}>目前版本</span>}
          </p>
          <p>分潤：VANTA {pct(a.vanta_share)}・車源 {pct(1 - a.vanta_share)}</p>
          <p className="admin-muted">協議日期 {a.agreement_date || '—'}｜生效日 {a.effective_date || '—'}</p>
          {a.cost_rules && <p>成本規則：{a.cost_rules}</p>}
          {a.other_terms && <p>其他條件：{a.other_terms}</p>}
          {a.notes && <p className="admin-muted">備註：{a.notes}</p>}
          <div className="inline-actions">
            {a.file_path && <button onClick={() => openFile(a)}>開啟協議文件</button>}
            {!a.is_current && <button onClick={() => makeCurrent(a)}>設為目前版本</button>}
          </div>
        </div>
      ))}

      {!form ? (
        <div className="case-actions">
          <button
            className="btn btn-light"
            onClick={() => setForm({
              version: `v${list.length + 1}.0`, agreementDate: today(), effectiveDate: today(),
              share: String(Math.round(defaultShare * 100)), costRules: '', otherTerms: '', notes: '', file: null, current: true,
            })}
          >
            ＋ 新增協議版本
          </button>
        </div>
      ) : (
        <div className="admin-form">
          <div className="field-grid">
            <label className="field"><span>版本</span><input {...setF('version')} /></label>
            <label className="field"><span>VANTA 分潤比例（%）</span><input type="number" inputMode="decimal" {...setF('share')} /></label>
            <label className="field"><span>協議日期</span><input type="date" {...setF('agreementDate')} /></label>
            <label className="field"><span>生效日期</span><input type="date" {...setF('effectiveDate')} /></label>
          </div>
          <label className="field"><span>成本規則</span><input placeholder="例如：單筆超過 1 萬需 VANTA 核准；收車成本以發票為準" {...setF('costRules')} /></label>
          <label className="field"><span>其他合作條件</span><input {...setF('otherTerms')} /></label>
          <label className="field"><span>備註</span><input {...setF('notes')} /></label>
          <label className="photo-add">
            {form.file ? `已選：${form.file.name}` : '＋ 上傳協議文件（PDF 或照片，選填）'}
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setForm({ ...form, file: (e.target.files && e.target.files[0]) || null })} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" style={{ width: 'auto', height: 'auto', margin: 0 }} checked={form.current} onChange={(e) => setForm({ ...form, current: e.target.checked })} />
            設為目前使用的協議
          </label>
          <p className="admin-muted">⚠️ 系統不會判斷協議內容是否有效，正式協議請由律師確認。協議文件只有管理員看得到。</p>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={addAgreement} disabled={busy}>{busy ? '儲存中…' : '新增協議'}</button>
          </div>
        </div>
      )}
      {msg && <p className="result-box">{msg}</p>}
    </div>
  );
  }
