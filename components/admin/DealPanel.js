'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';
import {
  VERIFICATION_LABEL, CUSTOMER_LABEL, PARTNER_REPORT_LABEL, SETTLEMENT_LABEL, APPROVAL_LABEL, CATEGORY_LABEL,
  nt, toneOf, confirmMessage, signedDocUrls,
} from '../../lib/deal';

const ROLE_LABEL = { admin: '管理員', staff: '客服', partner: '車源' };
const TABLE_LABEL = { sales: '成交', sale_costs: '成本', settlements: '結算', customer_confirmations: '客戶確認' };
const FIELD = {
  sale_price: '成交價', sale_date: '成交日期', verification: '成交確認', customer_confirmation: '客戶確認', partner_status: '車源回報',
  amount: '金額', approval: '審核', reject_reason: '拒絕原因', cost_date: '成本日期', description: '說明', cost_type_name: '類型',
  settlement_status: '結算狀態', settlement_date: '結算日', total_cost: '核准成本', gross_profit: '可分配利潤', vanta_share: 'VANTA 分潤', partner_share: '業務分潤', dealer_share: '車商分潤',
  override_vanta_ratio: 'VANTA 手動比例', override_dealer_ratio: '車商手動比例',
  response: '客戶回覆', notes: '備註',
};
const VALUE = {
  pending: '待處理', approved: '已核准', rejected: '已拒絕', confirmed: '已確認', conflict: '不一致', denied: '尚未成交',
  reported: '已回報', not_reported: '未回報', settled: '已結算', disputed: '爭議中',
};
const MONEY = ['sale_price', 'amount', 'total_cost', 'gross_profit', 'vanta_share', 'partner_share', 'dealer_share'];
const pct = (r) => (r === null || r === undefined ? '' : `${Math.round(Number(r) * 1000) / 10}%`);
const show = (k, v) => (v === null || v === undefined || v === '' ? '—' : MONEY.includes(k) ? nt(v) : VALUE[v] || String(v));

function auditLine(l) {
  const t = TABLE_LABEL[l.table_name] || l.table_name;
  if (l.action === 'INSERT') {
    const n = l.new_data || {};
    if (l.table_name === 'sale_costs') return `新增成本：${n.cost_type_name || ''} ${nt(n.amount)}（${show('approval', n.approval)}）`;
    if (l.table_name === 'sales') return `建立成交：${nt(n.sale_price)}`;
    return `建立${t}`;
  }
  if (l.action === 'DELETE') {
    const o = l.old_data || {};
    return l.table_name === 'sale_costs' ? `刪除成本：${o.cost_type_name || ''} ${nt(o.amount)}` : `刪除${t}`;
  }
  const o = l.old_data || {};
  const n = l.new_data || {};
  const changed = Object.keys(FIELD).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  if (!changed.length) return `${t}更新`;
  return `${t}：${changed.map((k) => `${FIELD[k]} ${show(k, o[k])} → ${show(k, n[k])}`).join('、')}`;
}

// 管理員專用：成交、成本審核、客戶確認、結算
export default function DealPanel({ caseRow, hasCustomerLine = false, onChange }) {
  const [sale, setSale] = useState(null);
  const [costs, setCosts] = useState([]);
  const [settlement, setSettlement] = useState(null);
  const [confirms, setConfirms] = useState([]);
  const [types, setTypes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saleForm, setSaleForm] = useState(null);
  const [costForm, setCostForm] = useState(null);
  const [docUrls, setDocUrls] = useState({});
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [stForm, setStForm] = useState(null);
  const [audit, setAudit] = useState([]);
  const [ratioForm, setRatioForm] = useState(null);
  const [dealerName, setDealerName] = useState('');

  async function load() {
    const sb = getSupabase();
    const [s, c, t] = await Promise.all([
      sb.from('sales').select('*, sale_costs!sale_costs_sale_id_fkey(*)').eq('case_id', caseRow.id).maybeSingle(),
      sb.from('customer_confirmations').select('*').eq('case_id', caseRow.id).order('created_at', { ascending: false }),
      sb.from('cost_types').select('*').eq('active', true).order('sort_order'),
    ]);
    const saleRow = s.data || null;
    setSale(saleRow);
    setCosts(saleRow ? [...(saleRow.sale_costs || [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) : []);
    setConfirms(c.data || []);
    setTypes(t.data || []);
    let st = null;
    if (saleRow) {
      const { data } = await sb.from('settlements').select('*').eq('sale_id', saleRow.id).maybeSingle();
      st = data || null;
      setSettlement(st);
      if (st && st.dealer_id) {
        const { data: d } = await sb.from('dealers').select('name').eq('id', st.dealer_id).maybeSingle();
        setDealerName((d && d.name) || '');
      } else {
        setDealerName('');
      }
      setStForm(st ? { status: st.settlement_status, date: st.settlement_date || '', notes: st.notes || '' } : null);
    } else {
      setSettlement(null);
    }
    // 成交、成本、結算、客戶確認的變更紀錄（誰在什麼時候改了什麼）
    const ids = [saleRow && saleRow.id, st && st.id, ...((saleRow && saleRow.sale_costs) || []).map((x) => x.id), ...(c.data || []).map((x) => x.id)].filter(Boolean);
    if (ids.length) {
      const { data: logs } = await sb
        .from('audit_log')
        .select('*')
        .in('table_name', ['sales', 'sale_costs', 'settlements', 'customer_confirmations'])
        .in('row_id', ids.map(String))
        .order('created_at', { ascending: false })
        .limit(100);
      const actorIds = [...new Set((logs || []).map((l) => l.actor_id).filter(Boolean))];
      const { data: people } = actorIds.length
        ? await sb.from('profiles').select('user_id, display_name, role').in('user_id', actorIds)
        : { data: [] };
      const who = Object.fromEntries((people || []).map((p) => [p.user_id, `${p.display_name || ''}（${ROLE_LABEL[p.role] || p.role}）`]));
      setAudit((logs || []).map((l) => ({ ...l, who: l.actor_id ? who[l.actor_id] || '後台使用者' : '系統／客戶' })));
    } else {
      setAudit([]);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [caseRow.id]);

  async function run(promise, after) {
    const { error } = await promise;
    if (error) return alert('操作失敗：' + error.message);
    if (after) after();
    await load();
    if (onChange) onChange();
  }

  function saveSale() {
    const price = Math.round(Number(saleForm.price));
    if (!price) return alert('請填寫成交價格');
    const row = {
      sale_price: price,
      sale_date: saleForm.date || null,
      notes: saleForm.notes.trim() || null,
      partner_status: 'reported',
      updated_at: new Date().toISOString(),
    };
    const sb = getSupabase();
    run(
      sale
        ? sb.from('sales').update(row).eq('id', sale.id)
        : sb.from('sales').insert({ ...row, case_id: caseRow.id, partner_id: caseRow.partner_id, reported_at: new Date().toISOString() }),
      () => setSaleForm(null)
    );
  }

  function setVerification(v) {
    if (!confirm(`將成交狀態設為「${VERIFICATION_LABEL[v]}」？這會記錄在變更紀錄中。`)) return;
    run(getSupabase().from('sales').update({ verification: v, updated_at: new Date().toISOString() }).eq('id', sale.id));
  }

  function reviewCost(cost, approval) {
    const reason = approval === 'rejected' ? prompt('拒絕原因（會讓車源看到）', '') : null;
    if (approval === 'rejected' && reason === null) return;
    run(
      getSupabase()
        .from('sale_costs')
        .update({
          approval,
          reject_reason: reason || null,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cost.id)
    );
  }

  function addCost() {
    const type = types.find((t) => t.id === costForm.typeId);
    const amount = Math.round(Number(costForm.amount));
    if (!type || !amount) return alert('請選擇類型並填寫金額');
    run(
      getSupabase().from('sale_costs').insert({
        sale_id: sale.id,
        partner_id: sale.partner_id,
        category: type.category,
        cost_type_id: type.id,
        cost_type_name: type.name,
        amount,
        description: costForm.desc.trim() || null,
        cost_date: costForm.date || null,
        approval: 'approved',
        approved_at: new Date().toISOString(),
      }),
      () => setCostForm(null)
    );
  }

  async function showDocs(cost) {
    try {
      const urls = await signedDocUrls(cost.receipt_paths);
      setDocUrls((d) => ({ ...d, [cost.id]: urls }));
    } catch (e) {
      alert('讀取憑證失敗：' + e.message);
    }
  }

  // 單一案件手動調整三方比例（只能在待結算時調整），清空則恢復合作協議比例
  function saveRatios() {
    const dealer = Number(ratioForm.dealer) / 100;
    const vanta = Number(ratioForm.vanta) / 100;
    if (!(dealer >= 0 && vanta >= 0 && dealer + vanta <= 1)) return alert('比例不正確：車商與 VANTA 合計不能超過 100%');
    run(
      getSupabase().from('settlements').update({ override_dealer_ratio: dealer, override_vanta_ratio: vanta, updated_at: new Date().toISOString() }).eq('id', settlement.id),
      () => setRatioForm(null)
    );
  }

  function clearRatios() {
    if (!confirm('恢復成合作協議（或預設）的比例？')) return;
    run(getSupabase().from('settlements').update({ override_dealer_ratio: null, override_vanta_ratio: null, updated_at: new Date().toISOString() }).eq('id', settlement.id));
  }

  function saveSettlement() {
    run(
      getSupabase()
        .from('settlements')
        .update({
          settlement_status: stForm.status,
          settlement_date: stForm.date || null,
          notes: stForm.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settlement.id)
    );
  }

  async function createConfirmation() {
    const { data, error } = await getSupabase()
      .from('customer_confirmations')
      .insert({ case_id: caseRow.id })
      .select('token')
      .single();
    if (error) return alert('建立失敗：' + error.message);
    showConfirmMessage(data.token);
    load();
  }

  // 直接用 LINE 傳成交確認按鈕給客戶（客戶在 LINE 按「是，已成交／尚未成交」）
  async function sendLineConfirmation() {
    if (!confirm('用 LINE 傳送成交確認給客戶？')) return;
    const { data } = await getSupabase().auth.getSession();
    const res = await fetch('/api/admin/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session ? data.session.access_token : ''}` },
      body: JSON.stringify({ action: 'send_confirmation', caseId: caseRow.id }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return alert(out.error || 'LINE 傳送失敗');
    setMsg('');
    alert('已用 LINE 傳送成交確認給客戶。');
    load();
    if (onChange) onChange();
  }

  function showConfirmMessage(token) {
    const url = `${window.location.origin}/confirm/${token}`;
    const text = confirmMessage(caseRow.case_no, caseRow.subject || (caseRow.car && caseRow.car.title), url);
    setMsg(text);
    setCopied(false);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {});
  }

  if (!loaded) return null;

  const pendingConfirm = confirms.find((c) => !c.response && new Date(c.expires_at) > new Date());
  const lastResponse = confirms.find((c) => c.response);
  const setS = (k) => ({ value: saleForm[k], onChange: (e) => setSaleForm({ ...saleForm, [k]: e.target.value }) });

  return (
    <div className="case-section">
      <h3>成交與結算（僅管理員可見）</h3>

      {sale ? (
        <>
          <div className="case-flags">
            <span className={`badge badge-${toneOf(sale.verification)}`}>{VERIFICATION_LABEL[sale.verification]}</span>
            <span className="badge badge-mid">{PARTNER_REPORT_LABEL[sale.partner_status]}</span>
            <span className={`badge badge-${toneOf(sale.customer_confirmation)}`}>{CUSTOMER_LABEL[sale.customer_confirmation]}</span>
          </div>
          <div className="money">
            <div className="money-row"><span>成交價格</span><span>{nt(sale.sale_price)}</span></div>
            <div className="money-row"><span>成交日期</span><span>{sale.sale_date || '—'}</span></div>
            {sale.notes && <div className="money-row"><span>車源備註</span><span>{sale.notes}</span></div>}
          </div>
          {sale.verification === 'conflict' && (
            <p className="notice">車源回報與客戶確認不一致。請聯絡雙方確認後，手動設定結果。</p>
          )}
          <div className="inline-actions">
            <button onClick={() => setSaleForm({ price: sale.sale_price || '', date: sale.sale_date || '', notes: sale.notes || '' })}>修改成交資料</button>
            {sale.verification !== 'confirmed' && <button onClick={() => setVerification('confirmed')}>手動確認成交</button>}
            {sale.verification !== 'conflict' && <button onClick={() => setVerification('conflict')}>標記為不一致</button>}
          </div>
        </>
      ) : (
        <>
          <p className="value">車源尚未回報成交。</p>
          <div className="inline-actions">
            <button onClick={() => setSaleForm({ price: '', date: new Date().toISOString().slice(0, 10), notes: '' })}>代車源記錄成交</button>
          </div>
        </>
      )}

      {saleForm && (
        <div className="admin-form">
          <label className="field"><span>成交價格（元）</span><input type="number" inputMode="numeric" {...setS('price')} /></label>
          <label className="field"><span>成交日期</span><input type="date" {...setS('date')} /></label>
          <label className="field"><span>備註</span><input {...setS('notes')} /></label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setSaleForm(null)}>取消</button>
            <button className="btn btn-dark" onClick={saveSale}>儲存</button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>客戶成交確認</h3>
      <p className="value" style={{ fontSize: 14 }}>
        {lastResponse
          ? `${lastResponse.response === 'confirmed' ? '客戶確認已成交' : '客戶回覆尚未成交'}（${new Date(lastResponse.responded_at).toLocaleDateString('zh-TW')}）`
          : pendingConfirm
            ? '已產生確認連結，等待客戶回覆'
            : '尚未請客戶確認'}
      </p>
      <div className="inline-actions">
        {hasCustomerLine && lastResponse?.response !== 'confirmed' && (
          <button onClick={sendLineConfirmation}>用 LINE 請客戶確認成交</button>
        )}
        {pendingConfirm ? (
          <button onClick={() => showConfirmMessage(pendingConfirm.token)}>複製確認訊息</button>
        ) : (
          <button onClick={createConfirmation}>產生客戶確認連結</button>
        )}
      </div>
      {msg && (
        <div className="result-box">
          {copied ? '已複製，' : ''}請貼到 LINE 官方帳號與客戶的對話中：
          <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', marginTop: 8 }}>{msg}</pre>
        </div>
      )}

      {sale && (
        <>
          <h3 style={{ marginTop: 20 }}>成本</h3>
          {costs.length === 0 && <p className="value" style={{ fontSize: 14 }}>尚未登記成本。</p>}
          {costs.map((c) => (
            <div className="cost-item" key={c.id}>
              <div className="cost-item-top">
                <span>{c.cost_type_name || CATEGORY_LABEL[c.category]}</span>
                <span>{nt(c.amount)}</span>
              </div>
              <p>
                {CATEGORY_LABEL[c.category]}・<span className={`badge badge-${toneOf(c.approval)}`}>{APPROVAL_LABEL[c.approval]}</span>
                {c.description ? `・${c.description}` : ''}
                {c.reject_reason ? `・拒絕原因：${c.reject_reason}` : ''}
              </p>
              <p className="admin-muted">
                成本日期 {c.cost_date || '—'}｜提交 {new Date(c.created_at).toLocaleString('zh-TW', { hour12: false })}
              </p>
              <div className="inline-actions">
                {c.approval !== 'approved' && <button onClick={() => reviewCost(c, 'approved')}>核准</button>}
                {c.approval !== 'rejected' && <button className="danger" onClick={() => reviewCost(c, 'rejected')}>拒絕</button>}
                {c.receipt_paths && c.receipt_paths.length > 0 && <button onClick={() => showDocs(c)}>憑證 {c.receipt_paths.length}</button>}
              </div>
              {docUrls[c.id] && (
                <div className="thumbs">
                  {docUrls[c.id].map((u) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                      {u.includes('.pdf') ? <span style={{ display: 'block', padding: 10, fontSize: 12 }}>PDF</span> : <img src={u} alt="" />}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {costForm ? (
            <div className="admin-form">
              <label className="field"><span>類型</span>
                <select value={costForm.typeId} onChange={(e) => setCostForm({ ...costForm, typeId: e.target.value })}>
                  <option value="">選擇類型</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="field"><span>金額（元）</span><input type="number" inputMode="numeric" value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })} /></label>
              <label className="field"><span>成本日期</span><input type="date" value={costForm.date} onChange={(e) => setCostForm({ ...costForm, date: e.target.value })} /></label>
              <label className="field"><span>說明</span><input value={costForm.desc} onChange={(e) => setCostForm({ ...costForm, desc: e.target.value })} /></label>
              <div className="form-actions">
                <button className="btn btn-light" onClick={() => setCostForm(null)}>取消</button>
                <button className="btn btn-dark" onClick={addCost}>新增成本</button>
              </div>
            </div>
          ) : (
            <div className="inline-actions"><button onClick={() => setCostForm({ typeId: '', amount: '', desc: '', date: new Date().toISOString().slice(0, 10) })}>＋ 代為新增成本</button></div>
          )}
        </>
      )}

      {settlement ? (
        <>
          <h3 style={{ marginTop: 20 }}>結算</h3>
          <div className="money">
            <div className="money-row"><span>成交價</span><span>{nt(settlement.sale_price)}</span></div>
            <div className="money-row"><span>收車成本</span><span>{nt(settlement.purchase_cost)}</span></div>
            <div className="money-row"><span>整備成本</span><span>{nt(settlement.reconditioning_cost)}</span></div>
            <div className="money-row"><span>其他成本</span><span>{nt(settlement.other_cost)}</span></div>
            <div className="money-row"><span>核准成本合計</span><span>{nt(settlement.total_cost)}</span></div>
            <div className="money-row money-total"><span>可分配利潤</span><span>{nt(settlement.gross_profit)}</span></div>
          </div>
          <div className="money-split money-split-3">
            <div><span>車商 {pct(settlement.dealer_ratio)}</span><strong>{nt(settlement.dealer_share)}</strong></div>
            <div><span>車源業務 {pct(settlement.partner_ratio)}</span><strong>{nt(settlement.partner_share)}</strong></div>
            <div><span>VANTA {pct(settlement.share_ratio)}</span><strong>{nt(settlement.vanta_share)}</strong></div>
          </div>
          <p className="admin-muted">
            車商：{dealerName || '⚠️ 這位車源業務尚未設定所屬車商（到「合作協議」設定）'}
            {settlement.override_vanta_ratio !== null || settlement.override_dealer_ratio !== null ? '｜本案已手動調整比例' : settlement.agreement_id ? '｜依合作協議比例' : '｜依預設比例'}
          </p>
          {settlement.gross_profit < 0 && <p className="notice">可分配利潤為負數，請確認成交價與成本。</p>}
          {settlement.settlement_status === 'pending' && (
            ratioForm ? (
              <div className="admin-form">
                <div className="field-grid">
                  <label className="field"><span>車商（%）</span><input type="number" inputMode="decimal" value={ratioForm.dealer} onChange={(e) => setRatioForm({ ...ratioForm, dealer: e.target.value })} /></label>
                  <label className="field"><span>VANTA（%）</span><input type="number" inputMode="decimal" value={ratioForm.vanta} onChange={(e) => setRatioForm({ ...ratioForm, vanta: e.target.value })} /></label>
                </div>
                <p className="admin-muted">車源業務 = 100% − 車商 − VANTA = {Math.round((100 - Number(ratioForm.dealer || 0) - Number(ratioForm.vanta || 0)) * 10) / 10}%</p>
                <div className="form-actions">
                  <button className="btn btn-light" onClick={() => setRatioForm(null)}>取消</button>
                  <button className="btn btn-dark" onClick={saveRatios}>套用到這個案件</button>
                </div>
              </div>
            ) : (
              <div className="inline-actions">
                <button onClick={() => setRatioForm({ dealer: String(Math.round(Number(settlement.dealer_ratio || 0) * 1000) / 10), vanta: String(Math.round(Number(settlement.share_ratio || 0) * 1000) / 10) })}>手動調整這個案件的比例</button>
                {(settlement.override_vanta_ratio !== null || settlement.override_dealer_ratio !== null) && <button onClick={clearRatios}>恢復協議比例</button>}
              </div>
            )
          )}
          {stForm && (
            <div className="field-grid">
              <label className="field"><span>結算狀態</span>
                <select value={stForm.status} onChange={(e) => setStForm({ ...stForm, status: e.target.value })}>
                  {Object.entries(SETTLEMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>結算日期</span><input type="date" value={stForm.date} onChange={(e) => setStForm({ ...stForm, date: e.target.value })} /></label>
            </div>
          )}
          {stForm && (
            <>
              <label className="field"><span>結算備註</span><input value={stForm.notes} onChange={(e) => setStForm({ ...stForm, notes: e.target.value })} /></label>
              <p className="admin-muted">設為「已結算」後金額會鎖定，車源不能再修改成交價或成本。</p>
              <div className="case-actions"><button className="btn btn-dark" onClick={saveSettlement}>儲存結算</button></div>
            </>
          )}
        </>
      ) : (
        sale && <p className="admin-muted" style={{ marginTop: 16 }}>成交確認完成（車源回報＋客戶確認）後，系統會自動建立結算。</p>
      )}
      {settlement && <p className="admin-muted">目前狀態：{SETTLEMENT_LABEL[settlement.settlement_status]}</p>}

      {audit.length > 0 && (
        <details className="viewing-history" style={{ marginTop: 16 }}>
          <summary>成交與結算變更紀錄（{audit.length}）</summary>
          <ul className="rank">
            {audit.map((l) => (
              <li key={l.id} style={{ display: 'block' }}>
                <span>{auditLine(l)}</span>
                <br />
                <span className="admin-muted">{l.who}｜{new Date(l.created_at).toLocaleString('zh-TW', { hour12: false })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
        }
