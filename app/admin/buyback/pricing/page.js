'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import { getSupabase } from '../../../../lib/supabase';
import { runEstimate, taiwanYear, DEFAULT_SETTINGS, findModelFactor, findCondition } from '../../../../lib/buyback/engine';
import { RULE_COLUMNS, parseCSV, toCSV, parseBool } from '../../../../lib/buyback/csv';

export default function PricingPage() {
  return (
    <AdminShell>
      <Pricing />
    </AdminShell>
  );
}

const EMPTY_RULE = {
  id: null, brand_id: '', model_id: '', reference_year: '', reference_price: '',
  brand_factor: '', year_factor: '', mileage_min: '', mileage_max: '', mileage_factor: '',
  estimated_low: '', estimated_high: '', source: '', source_url: '', source_updated_at: '',
  notes: '', active: true,
};
const INT_FIELDS = ['reference_year', 'reference_price', 'mileage_min', 'mileage_max', 'estimated_low', 'estimated_high',
  'market_price_low', 'market_price_high', 'buy_price_low', 'buy_price_high'];
const NUM_FIELDS = ['brand_factor', 'year_factor', 'mileage_factor'];
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/,/g, '')));
const nt = (n) => (n || n === 0 ? Number(n).toLocaleString('en-US') : '—');

function Pricing() {
  const [db, setDb] = useState(null);
  const [error, setError] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const sb = getSupabase();
    const [brands, rules, dep, km, settings, mfs, conds] = await Promise.all([
      sb.from('buyback_brands').select('id, name, brand_factor, active, sort_order, buyback_models(id, name, active, sort_order)').order('sort_order').order('name'),
      sb.from('pricing_rules').select('*').order('updated_at', { ascending: false }).limit(5000),
      sb.from('depreciation_rules').select('*').eq('active', true),
      sb.from('mileage_rules').select('*').eq('active', true),
      sb.from('buyback_settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('model_factors').select('brand_id, model, factor'),
      sb.from('condition_factors').select('*').order('sort_order'),
    ]);
    const err = brands.error || rules.error || dep.error || km.error;
    if (err) return setError('讀取失敗：' + err.message);
    setDb({
      brands: brands.data,
      rules: rules.data,
      dep: dep.data,
      km: km.data,
      modelFactors: mfs.data || [],
      conditions: conds.data || [],
      settings: { ...DEFAULT_SETTINGS, ...(settings.data || {}) },
    });
  }

  useEffect(() => {
    load();
  }, []);

  const lookup = useMemo(() => {
    const brandById = {};
    const modelById = {};
    (db ? db.brands : []).forEach((b) => {
      brandById[b.id] = b;
      (b.buyback_models || []).forEach((m) => { modelById[m.id] = { ...m, brand_id: b.id }; });
    });
    return { brandById, modelById };
  }, [db]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!db) return <p className="admin-muted">載入中…</p>;

  const staleCutoff = Date.now() - db.settings.stale_days * 864e5;
  const isStale = (r) => new Date(r.source_updated_at || r.updated_at).getTime() < staleCutoff;
  const rules = db.rules.filter((r) => !brandFilter || r.brand_id === brandFilter);
  const label = (r) => {
    const b = lookup.brandById[r.brand_id];
    const m = lookup.modelById[r.model_id];
    return `${b ? b.name : '?'} ${m ? m.name : '?'}`;
  };

  function startEdit(rule) {
    const form = { ...EMPTY_RULE };
    if (rule) Object.keys(form).forEach((key) => { form[key] = rule[key] ?? (key === 'active' ? true : ''); });
    setEditing(form);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveRule() {
    const f = editing;
    if (!f.model_id || !toNum(f.reference_year)) return alert('請選擇車型並填寫基準年份');
    if (!toNum(f.reference_price) && !(toNum(f.estimated_low) && toNum(f.estimated_high))) {
      return alert('請填寫基準價格，或填寫最低／最高收購價格');
    }
    const row = {
      brand_id: lookup.modelById[f.model_id].brand_id,
      model_id: f.model_id,
      source: f.source.trim() || null,
      source_url: f.source_url.trim() || null,
      source_updated_at: f.source_updated_at || null,
      notes: f.notes.trim() || null,
      active: !!f.active,
      updated_at: new Date().toISOString(),
    };
    INT_FIELDS.forEach((key) => { if (key in f) row[key] = toNum(f[key]) === null ? null : Math.round(toNum(f[key])); });
    NUM_FIELDS.forEach((key) => { row[key] = toNum(f[key]); });
    setBusy(true);
    const sb = getSupabase();
    const { error } = f.id
      ? await sb.from('pricing_rules').update(row).eq('id', f.id)
      : await sb.from('pricing_rules').insert(row);
    setBusy(false);
    if (error) return alert('儲存失敗：' + error.message);
    setEditing(null);
    load();
  }

  async function toggleRule(rule) {
    const { error } = await getSupabase()
      .from('pricing_rules')
      .update({ active: !rule.active, updated_at: new Date().toISOString() })
      .eq('id', rule.id);
    if (error) return alert('更新失敗：' + error.message);
    load();
  }

  async function deleteRule(rule) {
    if (!confirm(`刪除「${label(rule)} ${rule.reference_year}」這筆行情？過去的估價紀錄不受影響。`)) return;
    const { error } = await getSupabase().from('pricing_rules').delete().eq('id', rule.id);
    if (error) return alert('刪除失敗：' + error.message);
    load();
  }

  function exportCSV() {
    const rows = [RULE_COLUMNS];
    db.rules.forEach((r) => {
      const b = lookup.brandById[r.brand_id];
      const m = lookup.modelById[r.model_id];
      rows.push(RULE_COLUMNS.map((c) => {
        if (c === 'brand') return b ? b.name : '';
        if (c === 'model') return m ? m.name : '';
        return r[c];
      }));
    });
    const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vanta-pricing-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function importCSV(file) {
    if (!file) return;
    setBusy(true);
    setReport(null);
    const sb = getSupabase();
    const errors = [];
    let inserted = 0;
    let updated = 0;
    let replaced = 0;
    let removed = 0;
    let fileDupes = 0;
    try {
      const rows = parseCSV(await file.text());
      if (rows.length < 2) throw new Error('檔案沒有資料');
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (row, name) => {
        const i = header.indexOf(name);
        return i === -1 ? '' : String(row[i] ?? '').trim();
      };
      if (!header.includes('brand') || !header.includes('model') || !header.includes('reference_year')) {
        throw new Error('第一列必須包含 brand、model、reference_year 欄位');
      }

      const brandByName = {};
      const modelByKey = {};
      db.brands.forEach((b) => {
        brandByName[b.name.toLowerCase()] = b.id;
        (b.buyback_models || []).forEach((m) => { modelByKey[`${b.id}|${m.name.toLowerCase()}`] = m.id; });
      });
      const ruleIds = new Set(db.rules.map((r) => r.id));

      // 重複判斷：同一個車型＋同一個基準年份＋同樣的里程範圍，視為同一筆行情
      const dupKey = (r) => [r.model_id, r.reference_year, r.mileage_min ?? '', r.mileage_max ?? ''].join('|');
      const existingByKey = {};
      [...db.rules]
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
        .forEach((r) => {
          const key = dupKey(r);
          (existingByKey[key] = existingByKey[key] || []).push(r.id);
        });

      const pending = new Map();

      for (let i = 1; i < rows.length; i++) {
        const line = i + 1;
        const row = rows[i];
        const brandName = col(row, 'brand');
        const modelName = col(row, 'model');
        const year = toNum(col(row, 'reference_year'));
        if (!brandName || !modelName || !year) {
          errors.push(`第 ${line} 列：缺少品牌、車型或基準年份`);
          continue;
        }
        let brandId = brandByName[brandName.toLowerCase()];
        if (!brandId) {
          const { data, error } = await sb.from('buyback_brands').insert({ name: brandName }).select('id').single();
          if (error) { errors.push(`第 ${line} 列：新增品牌失敗（${error.message}）`); continue; }
          brandId = data.id;
          brandByName[brandName.toLowerCase()] = brandId;
        }
        const mKey = `${brandId}|${modelName.toLowerCase()}`;
        let modelId = modelByKey[mKey];
        if (!modelId) {
          const { data, error } = await sb.from('buyback_models').insert({ brand_id: brandId, name: modelName }).select('id').single();
          if (error) { errors.push(`第 ${line} 列：新增車型失敗（${error.message}）`); continue; }
          modelId = data.id;
          modelByKey[mKey] = modelId;
        }

        const rec = { brand_id: brandId, model_id: modelId, updated_at: new Date().toISOString() };
        let bad = false;
        INT_FIELDS.forEach((key) => {
          const v = toNum(col(row, key));
          if (v !== null && !Number.isFinite(v)) bad = true;
          rec[key] = v === null ? null : Math.round(v);
        });
        NUM_FIELDS.forEach((key) => {
          const v = toNum(col(row, key));
          if (v !== null && !Number.isFinite(v)) bad = true;
          rec[key] = v;
        });
        if (bad) { errors.push(`第 ${line} 列：數字欄位格式錯誤`); continue; }
        if (!rec.reference_price && !(rec.estimated_low && rec.estimated_high)) {
          errors.push(`第 ${line} 列：需要 reference_price，或 estimated_low＋estimated_high`);
          continue;
        }
        rec.source = col(row, 'source') || null;
        rec.source_url = col(row, 'source_url') || null;
        rec.source_updated_at = col(row, 'source_updated_at') || null;
        rec.notes = col(row, 'notes') || null;
        rec.active = parseBool(col(row, 'active'));

        const id = col(row, 'id');
        if (id && ruleIds.has(id)) {
          const { error } = await sb.from('pricing_rules').update(rec).eq('id', id);
          if (error) errors.push(`第 ${line} 列：更新失敗（${error.message}）`);
          else updated++;
          continue;
        }

        // 同一個檔案裡重複的列：以後面的為準
        const key = dupKey(rec);
        if (pending.has(key)) fileDupes++;
        pending.set(key, { line, rec });
      }

      const inserts = [];
      for (const [key, item] of pending) {
        const olds = existingByKey[key] || [];
        if (!olds.length) {
          inserts.push(item);
          continue;
        }
        // 資料庫已經有同一筆：用新資料取代最新的那筆，其餘舊的重複資料刪除
        const [keep, ...extra] = olds;
        const { error } = await sb.from('pricing_rules').update(item.rec).eq('id', keep);
        if (error) {
          errors.push(`第 ${item.line} 列：取代舊資料失敗（${error.message}）`);
          continue;
        }
        replaced++;
        if (extra.length) {
          const { error: delErr } = await sb.from('pricing_rules').delete().in('id', extra);
          if (delErr) errors.push(`第 ${item.line} 列：刪除舊的重複資料失敗（${delErr.message}）`);
          else removed += extra.length;
        }
      }

      for (let i = 0; i < inserts.length; i += 200) {
        const batch = inserts.slice(i, i + 200);
        const { error } = await sb.from('pricing_rules').insert(batch.map((x) => x.rec));
        if (error) errors.push(`第 ${batch[0].line}～${batch[batch.length - 1].line} 列：新增失敗（${error.message}）`);
        else inserted += batch.length;
      }
    } catch (e) {
      errors.push(e.message || String(e));
    }
    setReport({ inserted, updated, replaced, removed, fileDupes, errors });
    setBusy(false);
    load();
  }

  async function cleanDuplicates() {
    const groups = {};
    [...db.rules]
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
      .forEach((r) => {
        const key = [r.model_id, r.reference_year, r.mileage_min ?? '', r.mileage_max ?? ''].join('|');
        (groups[key] = groups[key] || []).push(r.id);
      });
    const extra = Object.values(groups).flatMap((ids) => ids.slice(1));
    if (!extra.length) return alert('目前沒有重複的行情資料。');
    if (!confirm(`找到 ${extra.length} 筆重複的舊資料（同車型、同基準年份、同里程範圍），每組只保留最新的一筆，其餘刪除？`)) return;
    setBusy(true);
    const sb = getSupabase();
    for (let i = 0; i < extra.length; i += 100) {
      const { error } = await sb.from('pricing_rules').delete().in('id', extra.slice(i, i + 100));
      if (error) {
        alert('刪除失敗：' + error.message);
        break;
      }
    }
    setBusy(false);
    load();
  }

  const brands = db.brands;
  const formBrand = editing && editing.model_id ? lookup.modelById[editing.model_id].brand_id : editing ? editing.brand_id : '';
  const formModels = formBrand ? (lookup.brandById[formBrand].buyback_models || []) : [];
  const staleCount = db.rules.filter((r) => r.active && isStale(r)).length;
  const set = (key) => ({ value: editing[key] ?? '', onChange: (e) => setEditing({ ...editing, [key]: e.target.value }) });

  return (
    <>
      <div className="admin-row-head">
        <h1>行情規則</h1>
        <button className="btn btn-dark btn-sm" onClick={() => startEdit(null)}>＋ 新增行情</button>
      </div>
      <p className="admin-muted">
        基準價格請填「台灣新車建議售價」。預估市場行情＝新車價 × 年份 × 里程 × 品牌 × 車款 × 車況係數；收購行情＝市場行情 × 估價設定的區間。
      </p>

      {staleCount > 0 && (
        <p className="notice">有 {staleCount} 筆行情超過 {db.settings.stale_days} 天沒有更新（標示「待更新」）。</p>
      )}

      {editing && (
        <div className="admin-form">
          <h3>{editing.id ? '編輯行情' : '新增行情'}</h3>
          <div className="field-grid">
            <label className="field"><span>品牌</span>
              <select value={formBrand} onChange={(e) => setEditing({ ...editing, brand_id: e.target.value, model_id: '' })}>
                <option value="">選擇品牌</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="field"><span>車型</span>
              <select {...set('model_id')} disabled={!formBrand}>
                <option value="">選擇車型</option>
                {formModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="field"><span>基準年份（適用此年份以後）</span><input type="number" inputMode="numeric" {...set('reference_year')} /></label>
            <label className="field"><span>基準價格（元）</span><input type="number" inputMode="numeric" {...set('reference_price')} /></label>
            <label className="field"><span>品牌係數（空白＝用品牌預設）</span><input type="number" step="0.01" inputMode="decimal" {...set('brand_factor')} /></label>
            <label className="field"><span>年份係數（空白＝用年份表）</span><input type="number" step="0.01" inputMode="decimal" {...set('year_factor')} /></label>
            <label className="field"><span>里程下限（km，選填）</span><input type="number" inputMode="numeric" {...set('mileage_min')} /></label>
            <label className="field"><span>里程上限（km，選填）</span><input type="number" inputMode="numeric" {...set('mileage_max')} /></label>
            <label className="field"><span>里程係數（選填）</span><input type="number" step="0.01" inputMode="decimal" {...set('mileage_factor')} /></label>
            <label className="field"><span>資料日期</span><input type="date" {...set('source_updated_at')} /></label>
            <label className="field"><span>最低收購價格（元，選填）</span><input type="number" inputMode="numeric" {...set('estimated_low')} /></label>
            <label className="field"><span>最高收購價格（元，選填）</span><input type="number" inputMode="numeric" {...set('estimated_high')} /></label>
          </div>
          <p className="admin-muted">
            有填最低／最高收購價格時，同年份、里程符合的車會直接顯示這個區間，不套公式。
          </p>
          <label className="field"><span>資料來源</span><input placeholder="例如：VANTA 實際收購、人工整理" {...set('source')} /></label>
          <label className="field"><span>來源網址（選填）</span><input {...set('source_url')} /></label>
          <label className="field"><span>備註</span><textarea {...set('notes')} /></label>
          <label className="field"><span>狀態</span>
            <select value={editing.active ? '1' : '0'} onChange={(e) => setEditing({ ...editing, active: e.target.value === '1' })}>
              <option value="1">啟用</option>
              <option value="0">停用</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setEditing(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={saveRule} disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      )}

      <Simulator db={db} lookup={lookup} />

      <div className="admin-card">
        <h3>CSV 匯入／匯出</h3>
        <p className="admin-muted">
          先匯出一份當範本，用 Excel 或 Google 試算表編輯後再匯入。品牌或車型不存在會自動建立。
          同車型、同基準年份、同里程範圍的資料視為重複：匯入時會用新資料取代舊的，不會重複新增。
        </p>
        <div className="inline-actions">
          <button onClick={exportCSV}>匯出 CSV</button>
          <button onClick={cleanDuplicates} disabled={busy}>清除重複資料</button>
          <label>
            {busy ? '匯入中…' : '匯入 CSV'}
            <input
              className="hidden-input"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                importCSV(e.target.files && e.target.files[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {report && (
          <div className="result-box">
            新增 {report.inserted} 筆、取代舊資料 {report.replaced + report.updated} 筆
            {report.removed > 0 && `、刪除重複舊資料 ${report.removed} 筆`}
            {report.fileDupes > 0 && `、檔案內重複 ${report.fileDupes} 列（以後面的為準）`}
            {report.errors.length > 0 && (
              <>
                ，{report.errors.length} 個問題：
                {report.errors.slice(0, 30).map((e) => <div key={e}>・{e}</div>)}
              </>
            )}
          </div>
        )}
      </div>

      <div className="tabs">
        <button aria-pressed={!brandFilter} onClick={() => setBrandFilter('')}>全部 {db.rules.length}</button>
        {brands
          .filter((b) => db.rules.some((r) => r.brand_id === b.id))
          .map((b) => (
            <button key={b.id} aria-pressed={brandFilter === b.id} onClick={() => setBrandFilter(b.id)}>{b.name}</button>
          ))}
      </div>

      {rules.length === 0 && <p className="admin-muted">還沒有行情規則。</p>}
      <div className="car-rows">
        {rules.map((r) => (
          <div className="lead-card" key={r.id}>
            <h3>
              {label(r)}　{r.reference_year}+{' '}
              {!r.active ? <span className="pill pill-off">停用</span> : isStale(r) ? <span className="pill pill-warn">待更新</span> : <span className="pill pill-ok">使用中</span>}
            </h3>
            <p className="lead-meta">
              基準價格 {nt(r.reference_price)}
              {r.brand_factor !== null && `｜品牌係數 ${r.brand_factor}`}
              {r.year_factor !== null && `｜年份係數 ${r.year_factor}`}
              {(r.mileage_min !== null || r.mileage_max !== null) && `｜里程 ${nt(r.mileage_min)}～${nt(r.mileage_max)} km`}
              {r.mileage_factor !== null && `（係數 ${r.mileage_factor}）`}
              {r.estimated_low && r.estimated_high ? `｜固定區間 ${nt(r.estimated_low)}–${nt(r.estimated_high)}` : ''}
              <br />
              {r.source || '未填來源'}｜資料日期 {r.source_updated_at || String(r.updated_at).slice(0, 10)}
              {r.notes && <><br />{r.notes}</>}
            </p>
            <div className="inline-actions">
              <button onClick={() => startEdit(r)}>編輯</button>
              <button onClick={() => toggleRule(r)}>{r.active ? '停用' : '啟用'}</button>
              <button className="danger" onClick={() => deleteRule(r)}>刪除</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Simulator({ db, lookup }) {
  const [brandId, setBrandId] = useState('');
  const [modelId, setModelId] = useState('');
  const [year, setYear] = useState(String(taiwanYear() - 3));
  const [km, setKm] = useState('42000');
  const [cond, setCond] = useState('normal');
  const brand = lookup.brandById[brandId];
  const model = lookup.modelById[modelId];

  let result = null;
  if (modelId && year) {
    result = runEstimate({
      rules: db.rules.filter((r) => r.model_id === modelId),
      brand,
      year: Number(year),
      mileage: km === '' ? null : Number(km),
      depreciation: db.dep,
      mileageRules: db.km,
      settings: db.settings,
      currentYear: taiwanYear(),
      modelFactor: findModelFactor(db.modelFactors.filter((m) => m.brand_id === brandId), model ? model.name : ''),
      condition: findCondition(db.conditions, cond),
    });
  }
  const b = result && result.breakdown;

  return (
    <div className="admin-card">
      <h3>估價試算</h3>
      <p className="admin-muted">用目前的規則和係數試算，確認數字合理再讓客人使用。試算不會留下紀錄。</p>
      <div className="field-grid">
        <label className="field"><span>品牌</span>
          <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); }}>
            <option value="">選擇品牌</option>
            {db.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="field"><span>車型</span>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!brand}>
            <option value="">選擇車型</option>
            {brand && (brand.buyback_models || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field"><span>年份</span><input type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
        <label className="field"><span>里程（km，空白＝不計）</span><input type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></label>
        <label className="field"><span>車況</span>
          <select value={cond} onChange={(e) => setCond(e.target.value)}>
            {(db.conditions.length ? db.conditions : [{ key: 'normal', label_zh: '正常' }]).map((c) => (
              <option key={c.key} value={c.key}>{c.label_zh}</option>
            ))}
          </select>
        </label>
      </div>
      {result && (
        <div className="result-box">
          {result.quality === 'none' ? (
            '缺少新車參考價格：這個車型還沒有行情規則，客人會看到「目前尚無足夠行情資料」。'
          ) : result.method === 'manual' ? (
            <>使用固定收購區間：NT${nt(result.low)} – {nt(result.high)}</>
          ) : (
            <>
              <div className="money-row"><span>參考新車價</span><span>NT${nt(b.referencePrice)}</span></div>
              <div className="money-row"><span>車齡</span><span>{b.age} 年</span></div>
              <div className="money-row"><span>年份係數</span><span>{b.yearFactor.toFixed(2)}</span></div>
              <div className="money-row"><span>里程</span><span>{b.mileage === null ? '未提供' : `${nt(b.mileage)} km`}</span></div>
              <div className="money-row"><span>里程係數</span><span>{b.mileageFactor.toFixed(2)}</span></div>
              <div className="money-row"><span>品牌係數</span><span>{b.brandFactor.toFixed(2)}</span></div>
              <div className="money-row"><span>車款係數</span><span>{b.modelFactor.toFixed(2)}</span></div>
              <div className="money-row"><span>車況</span><span>{b.conditionLabelZh}</span></div>
              <div className="money-row"><span>車況係數</span><span>{b.conditionFactor.toFixed(2)}</span></div>
              <div className="money-row money-total"><span>預估市場行情</span><span>NT${nt(b.market)}</span></div>
              <div className="money-row"><span>預估收購行情（客人在賣車頁看到）</span><span>NT${nt(result.low)} – {nt(result.high)}</span></div>
              {result.quality === 'nearest' && <p className="admin-muted">這個年份沒有完全對應的規則，客人會看到「資料有限」。</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
                                                   }
