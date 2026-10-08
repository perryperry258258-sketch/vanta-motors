'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import { getSupabase } from '../../../../lib/supabase';
import { conditionLabel } from '../../../../lib/buyback/conditions';

export default function LeadsPage() {
  return (
    <AdminShell>
      <Leads />
    </AdminShell>
  );
}

const STATUS = [
  ['new', '新線索'],
  ['contacted', '已聯絡'],
  ['inspected', '已看車'],
  ['quoted', '已報價'],
  ['purchased', '已收車'],
  ['lost', '未成交'],
];
const STATUS_LABEL = Object.fromEntries(STATUS);
const k = (n) => (n ? `${Math.round(n / 1000)}K` : '—');
const toInt = (v) => (v === '' || v === null || v === undefined ? null : Math.round(Number(v)));

function Leads() {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      const { data, error } = await getSupabase()
        .from('buyback_leads')
        .select('*, actual_purchases(*)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) setError('讀取失敗：' + error.message);
      else setLeads(data);
    })();
  }, []);

  const counts = useMemo(() => {
    const c = { all: (leads || []).length };
    (leads || []).forEach((l) => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [leads]);

  const list = (leads || []).filter((l) => filter === 'all' || l.status === filter);

  function replace(updated) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
  }

  return (
    <>
      <h1>收車線索</h1>
      <p className="admin-muted">客人在估價結果按下 LINE 按鈕時，會自動建立一筆線索。</p>
      <div className="tabs">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部 {counts.all || 0}</button>
        {STATUS.map(([s, label]) => (
          <button key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>{label} {counts[s] || 0}</button>
        ))}
      </div>
      {error && <p className="admin-error">{error}</p>}
      {leads === null && !error && <p className="admin-muted">載入中…</p>}
      {leads && list.length === 0 && <p className="admin-muted">目前沒有線索。</p>}
      <div className="car-rows">
        {list.map((lead) => <LeadCard key={lead.id} lead={lead} onChange={replace} />)}
      </div>
    </>
  );
}

function LeadCard({ lead, onChange }) {
  const purchase = Array.isArray(lead.actual_purchases) ? lead.actual_purchases[0] : lead.actual_purchases;
  const [photoUrls, setPhotoUrls] = useState(null);
  const [note, setNote] = useState(lead.note || '');
  const [showBuy, setShowBuy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buy, setBuy] = useState({
    actual_buy_price: purchase ? purchase.actual_buy_price ?? '' : '',
    condition_notes: purchase ? purchase.condition_notes || '' : '',
    accident: purchase ? purchase.accident || '' : '',
    reconditioning_cost: purchase ? purchase.reconditioning_cost ?? '' : '',
    other_cost: purchase ? purchase.other_cost ?? '' : '',
    final_status: purchase ? purchase.final_status : 'purchased',
    purchased_at: purchase ? purchase.purchased_at || '' : new Date().toISOString().slice(0, 10),
    notes: purchase ? purchase.notes || '' : '',
  });

  async function setStatus(status) {
    const { error } = await getSupabase()
      .from('buyback_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (error) return alert('更新失敗：' + error.message);
    onChange({ id: lead.id, status });
  }

  async function saveNote() {
    const { error } = await getSupabase()
      .from('buyback_leads')
      .update({ note: note.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (error) return alert('儲存失敗：' + error.message);
    onChange({ id: lead.id, note: note.trim() || null });
  }

  async function loadPhotos() {
    const paths = lead.photo_paths || [];
    if (!paths.length) return setPhotoUrls([]);
    const { data, error } = await getSupabase().storage.from('buyback-photos').createSignedUrls(paths, 3600);
    if (error) return alert('讀取照片失敗：' + error.message);
    setPhotoUrls(data.map((d) => d.signedUrl).filter(Boolean));
  }

  async function savePurchase() {
    if (buy.final_status === 'purchased' && !toInt(buy.actual_buy_price)) {
      return alert('請填寫實際收購價格');
    }
    setSaving(true);
    const sb = getSupabase();
    const row = {
      lead_id: lead.id,
      estimate_id: lead.estimate_id,
      brand_name: lead.brand_name,
      model_name: lead.model_name,
      year: lead.year,
      mileage: lead.mileage,
      estimated_low: lead.estimated_low,
      estimated_high: lead.estimated_high,
      actual_buy_price: toInt(buy.actual_buy_price),
      condition_notes: buy.condition_notes.trim() || null,
      accident: buy.accident.trim() || null,
      reconditioning_cost: toInt(buy.reconditioning_cost),
      other_cost: toInt(buy.other_cost),
      final_status: buy.final_status,
      purchased_at: buy.purchased_at || null,
      notes: buy.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from('actual_purchases').upsert(row, { onConflict: 'lead_id' }).select().single();
    if (error) {
      setSaving(false);
      return alert('儲存失敗：' + error.message);
    }
    const status = buy.final_status === 'purchased' ? 'purchased' : 'lost';
    await sb.from('buyback_leads').update({ status, updated_at: new Date().toISOString() }).eq('id', lead.id);
    onChange({ id: lead.id, status, actual_purchases: data });
    setSaving(false);
    setShowBuy(false);
  }

  const created = new Date(lead.created_at).toLocaleString('zh-TW', { hour12: false });
  const field = (key) => ({ value: buy[key], onChange: (e) => setBuy({ ...buy, [key]: e.target.value }) });

  return (
    <div className="lead-card">
      <h3>{lead.year} {lead.brand_name} {lead.model_name}</h3>
      <p className="lead-meta">
        {Number(lead.mileage || 0).toLocaleString('en-US')} km｜網站預估 {k(lead.estimated_low)}–{k(lead.estimated_high)}
        {purchase && purchase.actual_buy_price ? `｜實際收購 ${k(purchase.actual_buy_price)}` : ''}
        <br />
        {created}｜LINE 點擊 {lead.line_clicks} 次｜照片 {(lead.photo_paths || []).length} 張
        {(lead.name || lead.phone || lead.line_id) && (
          <>
            <br />
            {[lead.name, lead.phone, lead.line_id && `LINE: ${lead.line_id}`].filter(Boolean).join('｜')}
          </>
        )}
        {(lead.accident || lead.flood || lead.maintenance || lead.region) && (
          <>
            <br />
            {[
              lead.region,
              lead.accident && `事故：${conditionLabel('accident', lead.accident)}`,
              lead.flood && `泡水：${conditionLabel('flood', lead.flood)}`,
              lead.maintenance && `保養：${conditionLabel('maintenance', lead.maintenance)}`,
            ].filter(Boolean).join('｜')}
          </>
        )}
        {lead.condition_note && (
          <>
            <br />
            客人說明：{lead.condition_note}
          </>
        )}
      </p>

      <select className="lead-status" value={lead.status} onChange={(e) => setStatus(e.target.value)}>
        {STATUS.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
      </select>

      <div className="inline-actions">
        {(lead.photo_paths || []).length > 0 && <button onClick={loadPhotos}>查看照片</button>}
        <button onClick={() => setShowBuy(!showBuy)}>{purchase ? '修改實際收購' : '記錄實際收購'}</button>
      </div>

      {photoUrls && photoUrls.length > 0 && (
        <div className="thumbs">
          {photoUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" /></a>
          ))}
        </div>
      )}

      <label className="field">
        <span>備註</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (lead.note || '') && saveNote()} />
      </label>

      {showBuy && (
        <div className="admin-form">
          <p className="admin-muted">
            網站預估 {k(lead.estimated_low)}–{k(lead.estimated_high)}，填入實際收購價格後，總覽頁會自動計算誤差。
          </p>
          <div className="field-grid">
            <label className="field"><span>最後狀態</span>
              <select {...field('final_status')}>
                <option value="purchased">已收車</option>
                <option value="cancelled">未成交</option>
              </select>
            </label>
            <label className="field"><span>日期</span><input type="date" {...field('purchased_at')} /></label>
            <label className="field"><span>實際收購價格（元）</span><input type="number" inputMode="numeric" placeholder="815000" {...field('actual_buy_price')} /></label>
            <label className="field"><span>事故紀錄</span><input placeholder="無／輕微／有" {...field('accident')} /></label>
            <label className="field"><span>整理費（元）</span><input type="number" inputMode="numeric" {...field('reconditioning_cost')} /></label>
            <label className="field"><span>其他成本（元）</span><input type="number" inputMode="numeric" {...field('other_cost')} /></label>
          </div>
          <label className="field"><span>車況</span><textarea {...field('condition_notes')} /></label>
          <label className="field"><span>其他備註</span><textarea {...field('notes')} /></label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setShowBuy(false)} disabled={saving}>取消</button>
            <button className="btn btn-dark" onClick={savePurchase} disabled={saving}>{saving ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      )}

      <p className="admin-muted">狀態：{STATUS_LABEL[lead.status]}</p>
    </div>
  );
                                          }
