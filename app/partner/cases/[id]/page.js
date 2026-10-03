'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PartnerShell, { usePartner } from '../../../../components/partner/PartnerShell';
import { getSupabase } from '../../../../lib/supabase';
import ViewingPanel from '../../../../components/case/ViewingPanel';
import QuestionsPanel from '../../../../components/case/QuestionsPanel';
import ResultPanel from '../../../../components/case/ResultPanel';
import { STATUS_LABEL, statusTone, shortDate } from '../../../../lib/case';
import {
  PARTNER_ACTIONS, VERIFICATION_LABEL, APPROVAL_LABEL, SETTLEMENT_LABEL, CATEGORY_LABEL,
  nt, toneOf, uploadDealDoc,
} from '../../../../lib/deal';

export default function PartnerCasePage() {
  return (
    <PartnerShell>
      <PartnerCase />
    </PartnerShell>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function PartnerCase() {
  const { id } = useParams();
  const { profile } = usePartner();
  const [c, setC] = useState(null);
  const [events, setEvents] = useState([]);
  const [sale, setSale] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [types, setTypes] = useState([]);
  const [threshold, setThreshold] = useState(10000);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [saleForm, setSaleForm] = useState(null);
  const [costForm, setCostForm] = useState(null);

  async function load() {
    const sb = getSupabase();
    const [cr, ev, sr, tr, st] = await Promise.all([
      sb.from('cases').select('*').eq('id', id).maybeSingle(),
      sb.from('case_events').select('*').eq('case_id', id).order('created_at'),
      sb.from('sales').select('*, sale_costs!sale_costs_sale_id_fkey(*)').eq('case_id', id).maybeSingle(),
      sb.from('cost_types').select('*').eq('active', true).order('sort_order'),
      sb.from('crm_settings').select('cost_approval_threshold').eq('id', 1).maybeSingle(),
    ]);
    if (cr.error || !cr.data) return setError('找不到這個案件，或這個案件沒有指派給你。');
    setC(cr.data);
    setEvents(ev.data || []);
    setSale(sr.data || null);
    setTypes(tr.data || []);
    if (st.data) setThreshold(st.data.cost_approval_threshold);
    if (sr.data) {
      const { data } = await sb.from('settlements').select('*').eq('sale_id', sr.data.id).maybeSingle();
      setSettlement(data || null);
    } else {
      setSettlement(null);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!c) return <p className="admin-muted">載入中…</p>;

  const locked = settlement && settlement.settlement_status === 'settled';
  const closed = ['won', 'cancelled'].includes(c.status);

  async function call(fn, args, after) {
    setBusy(true);
    const { error } = await getSupabase().rpc(fn, args);
    setBusy(false);
    if (error) return alert(error.message === 'not allowed' ? '沒有權限操作這個案件' : error.message);
    if (after) after();
    load();
  }

  function sendProgress() {
    if (!action && !note.trim()) return alert('請選擇進度或填寫說明');
    const text = note.trim();
    call('partner_update_case', { p_case: c.id, p_status: action || null, p_note: text || null }, () => {
      setAction('');
      setNote('');
    });
  }

  // 接受案件／無法配合：由伺服器確認案件屬於自己才會更新
  async function respond(kind) {
    let reason = '';
    if (kind === 'decline') {
      reason = prompt('無法配合的原因（選填），例如：車已售出、這週無法帶看');
      if (reason === null) return;
    }
    setBusy(true);
    try {
      const { data } = await getSupabase().auth.getSession();
      const res = await fetch('/api/partner/case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ caseId: c.id, action: kind, note: reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || '操作失敗');
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
    load();
  }

  // 回報成交後，自動請客戶在 LINE 確認（雙方都確認才算成交）
  async function reportSale() {
    const price = Math.round(Number(String(saleForm.price).replace(/,/g, '')));
    if (!price) return alert('請填寫實際成交價格');
    setBusy(true);
    const sb = getSupabase();
    const { error } = await sb.rpc('partner_report_sale', { p_case: c.id, p_price: price, p_date: saleForm.date || today(), p_note: saleForm.note || null });
    if (error) {
      setBusy(false);
      return alert(error.message === 'not allowed' ? '沒有權限操作這個案件' : error.message);
    }
    setSaleForm(null);
    try {
      const { data } = await sb.auth.getSession();
      const res = await fetch('/api/partner/case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ caseId: c.id, action: 'sale_reported' }),
      });
      const out = await res.json().catch(() => ({}));
      alert(out.sent ? '已回報成交，VANTA 已用 LINE 請客戶確認。客戶確認後才會進入結算。' : `已回報成交。${out.reason || out.error || ''}`);
    } catch (e) {
      alert('已回報成交，VANTA 會另外請客戶確認。');
    }
    setBusy(false);
    load();
  }

  async function addCost() {
    const amount = Math.round(Number(String(costForm.amount).replace(/,/g, '')));
    if (!costForm.typeId || !amount) return alert('請選擇成本類型並填寫金額');
    setBusy(true);
    try {
      const paths = [];
      for (const file of costForm.files) {
        paths.push(await uploadDealDoc(file, profile.partner_id, sale.id));
      }
      const { error } = await getSupabase().rpc('partner_add_cost_dated', {
        p_sale: sale.id,
        p_type: costForm.typeId,
        p_amount: amount,
        p_date: costForm.date || today(),
        p_desc: costForm.desc || null,
        p_receipts: paths,
      });
      if (error) throw error;
      setCostForm(null);
      load();
    } catch (e) {
      alert('新增失敗：' + (e.message || e));
    }
    setBusy(false);
  }

  function deleteCost(cost) {
    if (!confirm(`刪除「${cost.cost_type_name}」${nt(cost.amount)}？`)) return;
    call('partner_delete_cost', { p_cost: cost.id });
  }

  const costs = sale ? [...(sale.sale_costs || [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];
  // 舊案件沒有接案紀錄，視為已接案
  const pending = c.partner_response === 'pending';
  const declined = c.partner_response === 'declined';
  const accepted = !pending && !declined;

  return (
    <>
      <div className="case-head">
        <p className="case-no">{c.case_no}</p>
        <h1>{c.subject || '未指定車輛'}</h1>
        <div className="case-flags">
          <span className={`badge badge-${statusTone(c.status)}`}>{STATUS_LABEL[c.status]}</span>
          {sale && <span className={`badge badge-${toneOf(sale.verification)}`}>{VERIFICATION_LABEL[sale.verification]}</span>}
        </div>
      </div>

      {pending && !closed && (
        <div className="new-case">
          <h2>🔴 新案件</h2>
          <dl>
            <div><dt>案件編號</dt><dd>{c.case_no}</dd></div>
            <div><dt>車輛</dt><dd>{c.subject || '未指定'}</dd></div>
            <div><dt>案件來源</dt><dd>VANTA MOTORS</dd></div>
            <div><dt>客戶需求</dt><dd>{c.customer_request || '—'}</dd></div>
          </dl>
          <div className="big-actions">
            <button className="btn btn-dark" onClick={() => respond('accept')} disabled={busy}>接受案件</button>
            <button className="btn btn-light" onClick={() => respond('decline')} disabled={busy}>無法配合</button>
          </div>
        </div>
      )}

      {declined && <p className="result-box">你已回覆無法配合這個案件，VANTA 會另外安排。</p>}

      {!pending && (
        <div className="case-section">
          <h3>客戶需求</h3>
          <p className="value" style={{ whiteSpace: 'pre-line' }}>{c.customer_request || '—'}</p>
          <p className="admin-muted" style={{ marginTop: 8 }}>客戶聯絡由 VANTA 統一處理，有任何問題或需要轉達的事項，請在下方回報。</p>
        </div>
      )}

      {accepted && <QuestionsPanel caseRow={c} mode="partner" onChange={load} />}

      {accepted && <ViewingPanel caseRow={c} mode="partner" onChange={load} />}

      {accepted && (
        <ResultPanel
          caseRow={c}
          mode="partner"
          onChange={load}
          onSold={() => !(sale && sale.partner_status === 'reported') && setSaleForm({ price: '', date: today(), note: '' })}
        />
      )}

      {accepted && !closed && (
        <div className="case-section">
          <h3>回報進度</h3>
          <div className="quick">
            {PARTNER_ACTIONS.filter(([k]) => k !== 'viewing').map(([k, label]) => (
              <button key={k} aria-pressed={action === k} onClick={() => setAction(action === k ? '' : k)}>{label}</button>
            ))}
          </div>
          <textarea placeholder="補充說明（選填），例如：已回覆里程 4.2 萬、無事故" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="case-actions"><button className="btn btn-dark" onClick={sendProgress} disabled={busy}>送出進度</button></div>
        </div>
      )}

      {accepted && <div className="case-section">
        <h3>成交</h3>
        {sale && sale.partner_status === 'reported' ? (
          <div className="money">
            <div className="money-row"><span>成交價格</span><span>{nt(sale.sale_price)}</span></div>
            <div className="money-row"><span>成交日期</span><span>{sale.sale_date || '—'}</span></div>
            <div className="money-row"><span>狀態</span><span>{VERIFICATION_LABEL[sale.verification]}</span></div>
          </div>
        ) : (
          <p className="value">還沒有回報成交。</p>
        )}
        {!locked && !saleForm && (
          <div className="case-actions">
            <button className="btn btn-dark" onClick={() => setSaleForm({ price: (sale && sale.sale_price) || '', date: (sale && sale.sale_date) || today(), note: '' })}>
              {sale && sale.partner_status === 'reported' ? '修改成交資料' : '回報成交'}
            </button>
          </div>
        )}
        {saleForm && (
          <div className="admin-form">
            <label className="field"><span>實際成交價格（元，必填）</span><input type="number" inputMode="numeric" placeholder="950000" value={saleForm.price} onChange={(e) => setSaleForm({ ...saleForm, price: e.target.value })} /></label>
            <label className="field"><span>成交日期</span><input type="date" value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} /></label>
            <label className="field"><span>備註</span><input value={saleForm.note} onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })} /></label>
            <p className="admin-muted">送出後 VANTA 會用 LINE 請客戶確認成交，雙方一致後才會進入結算。</p>
            <div className="form-actions">
              <button className="btn btn-light" onClick={() => setSaleForm(null)} disabled={busy}>取消</button>
              <button className="btn btn-dark" onClick={reportSale} disabled={busy}>{busy ? '送出中…' : '確認回報'}</button>
            </div>
          </div>
        )}
      </div>}

      {sale && sale.partner_status === 'reported' && (
        <div className="case-section">
          <h3>成本</h3>
          <p className="admin-muted">單筆超過 {nt(threshold)} 需要 VANTA 確認後才列入分潤計算。</p>
          {costs.length === 0 && <p className="value" style={{ fontSize: 14 }}>尚未新增成本。</p>}
          {costs.map((cost) => (
            <div className="cost-item" key={cost.id}>
              <div className="cost-item-top">
                <span>{cost.cost_type_name}</span>
                <span>{nt(cost.amount)}</span>
              </div>
              <p>
                {CATEGORY_LABEL[cost.category]}・<span className={`badge badge-${toneOf(cost.approval)}`}>{APPROVAL_LABEL[cost.approval]}</span>
                {cost.receipt_paths && cost.receipt_paths.length ? `・憑證 ${cost.receipt_paths.length}` : ''}
                {cost.description ? `・${cost.description}` : ''}
                {cost.reject_reason ? `・拒絕原因：${cost.reject_reason}` : ''}
              </p>
              <p className="admin-muted">成本日期 {cost.cost_date || '—'}｜提交 {new Date(cost.created_at).toLocaleString('zh-TW', { hour12: false })}</p>
              {!locked && <div className="inline-actions"><button className="danger" onClick={() => deleteCost(cost)}>刪除</button></div>}
            </div>
          ))}
          {!locked && !costForm && (
            <div className="case-actions">
              <button className="btn btn-light" onClick={() => setCostForm({ typeId: '', amount: '', desc: '', date: today(), files: [] })}>＋ 上傳成本</button>
            </div>
          )}
          {costForm && (
            <div className="admin-form">
              <label className="field"><span>成本類型</span>
                <select value={costForm.typeId} onChange={(e) => setCostForm({ ...costForm, typeId: e.target.value })}>
                  <option value="">選擇類型</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="field"><span>金額（元）</span><input type="number" inputMode="numeric" value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })} /></label>
              <label className="field"><span>成本日期</span><input type="date" value={costForm.date} onChange={(e) => setCostForm({ ...costForm, date: e.target.value })} /></label>
              <label className="field"><span>說明（選填）</span><input placeholder="例如：前保桿烤漆" value={costForm.desc} onChange={(e) => setCostForm({ ...costForm, desc: e.target.value })} /></label>
              <label className="photo-add">
                {costForm.files.length ? `已選 ${costForm.files.length} 個憑證，點此重選` : '＋ 憑證照片或 PDF（發票、收據、維修單）'}
                <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setCostForm({ ...costForm, files: Array.from(e.target.files || []) })} />
              </label>
              <p className="admin-muted">憑證只有 VANTA 管理員與你看得到。請避免拍到身分證字號等不必要的個資。</p>
              <div className="form-actions">
                <button className="btn btn-light" onClick={() => setCostForm(null)} disabled={busy}>取消</button>
                <button className="btn btn-dark" onClick={addCost} disabled={busy}>{busy ? '上傳中…' : '新增成本'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {settlement && (
        <div className="case-section">
          <h3>分潤結算</h3>
          <div className="money">
            <div className="money-row"><span>成交價</span><span>{nt(settlement.sale_price)}</span></div>
            <div className="money-row"><span>核准成本</span><span>{nt(settlement.total_cost)}</span></div>
            <div className="money-row money-total"><span>可分配利潤</span><span>{nt(settlement.gross_profit)}</span></div>
          </div>
          <div className="money-split">
            <div><span>你的分潤</span><strong>{nt(settlement.partner_share)}</strong></div>
            <div><span>VANTA</span><strong>{nt(settlement.vanta_share)}</strong></div>
          </div>
          <p className="admin-muted" style={{ marginTop: 10 }}>
            狀態：{SETTLEMENT_LABEL[settlement.settlement_status]}
            {settlement.settlement_date ? `｜結算日 ${settlement.settlement_date}` : ''}
          </p>
        </div>
      )}

      <div className="case-section">
        <h3>案件紀錄</h3>
        <ul className="timeline">
          {events.map((e) => (
            <li key={e.id}>
              <time>{shortDate(e.created_at)}</time>
              <p>{e.type === 'status' && e.meta ? `狀態：${STATUS_LABEL[e.meta.from] || '—'} → ${STATUS_LABEL[e.meta.to] || '—'}` : e.body}</p>
              <span className="who">{e.actor_label || '系統'}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
        }
