'use client';

import { useEffect, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import { getSupabase } from '../../../../lib/supabase';
import { DEFAULT_SETTINGS } from '../../../../lib/buyback/engine';

export default function CatalogPage() {
  return (
    <AdminShell>
      <Catalog />
    </AdminShell>
  );
}

const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function Catalog() {
  const [brands, setBrands] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [newBrand, setNewBrand] = useState('');

  async function load() {
    const { data, error } = await getSupabase()
      .from('buyback_brands')
      .select('*, buyback_models(*)')
      .order('sort_order')
      .order('name');
    if (error) return setError('讀取失敗：' + error.message);
    setBrands(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function addBrand() {
    const name = newBrand.trim();
    if (!name) return;
    const sort = brands.length ? Math.max(...brands.map((b) => b.sort_order || 0)) + 1 : 1;
    const { error } = await getSupabase().from('buyback_brands').insert({ name, sort_order: sort });
    if (error) return alert('新增失敗：' + error.message);
    setNewBrand('');
    load();
  }

  return (
    <>
      <h1>品牌與係數</h1>

      <div className="admin-card">
        <h3>品牌與車型</h3>
        <p className="admin-muted">停用的品牌或車型不會出現在「我要賣車」的選單。品牌係數只用在估價計算，前台不會顯示。</p>
        {error && <p className="admin-error">{error}</p>}
        {!brands && !error && <p className="admin-muted">載入中…</p>}
        {brands && (
          <ul className="rank">
            {brands.map((b) => (
              <li key={b.id} style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <button style={{ textAlign: 'left', padding: 0 }} onClick={() => setOpenId(openId === b.id ? null : b.id)}>
                    {b.name}{' '}
                    {!b.active && <span className="pill pill-off">停用</span>}
                  </button>
                  <span className="admin-muted" style={{ margin: 0 }}>
                    係數 {b.brand_factor}｜車型 {(b.buyback_models || []).length}
                  </span>
                </div>
                {openId === b.id && <BrandEditor brand={b} onSaved={load} />}
              </li>
            ))}
          </ul>
        )}
        <div className="add-row">
          <input placeholder="新增品牌名稱" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          <button className="btn btn-dark btn-sm" onClick={addBrand}>新增</button>
        </div>
      </div>

      <ModelFactors brands={brands || []} />

      <ConditionFactors />

      <FactorTable
        title="年份係數"
        hint="車齡＝今年 − 車輛年份。例如 0～1 年填 0 和 1；最後一列的上限留空代表「以上」。"
        table="depreciation_rules"
        minKey="age_min"
        maxKey="age_max"
        minLabel="車齡下限（年）"
        maxLabel="車齡上限（含）"
      />

      <FactorTable
        title="里程係數"
        hint="下限包含、上限不包含，例如 30000～50000 代表 3 萬到未滿 5 萬公里。1.02 代表 +2%，0.95 代表 −5%。"
        table="mileage_rules"
        minKey="km_min"
        maxKey="km_max"
        minLabel="里程下限（km）"
        maxLabel="里程上限（km）"
      />

      <Settings />
    </>
  );
}

function ModelFactors({ brands }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await getSupabase()
      .from('model_factors')
      .select('*, brand:buyback_brands(name)')
      .order('updated_at', { ascending: false });
    if (error) return alert('讀取失敗：' + error.message);
    setRows(data);
  }

  useEffect(() => {
    load();
  }, []);

  const brand = brands.find((b) => b.id === (form && form.brandId));
  const models = brand ? [...(brand.buyback_models || [])].sort((a, b) => a.name.localeCompare(b.name)) : [];

  async function save() {
    const f = Number(form.factor);
    if (!form.brandId || !form.model.trim()) return alert('請選擇品牌並填寫車型');
    if (!Number.isFinite(f) || f <= 0) return alert('係數要大於 0，例如 1.05');
    setBusy(true);
    const sb = getSupabase();
    const row = { brand_id: form.brandId, model: form.model.trim(), factor: f, updated_at: new Date().toISOString() };
    const { error } = form.id
      ? await sb.from('model_factors').update(row).eq('id', form.id)
      : await sb.from('model_factors').insert(row);
    setBusy(false);
    if (error) return alert(error.message.includes('duplicate') ? '這個品牌＋車型已經有係數了，請直接修改' : '儲存失敗：' + error.message);
    setForm(null);
    load();
  }

  async function remove(r) {
    if (!confirm(`刪除 ${r.brand ? r.brand.name : ''}｜${r.model} 的車款係數？刪除後這個車型會使用 1.00。`)) return;
    const { error } = await getSupabase().from('model_factors').delete().eq('id', r.id);
    if (error) return alert('刪除失敗：' + error.message);
    load();
  }

  return (
    <div className="admin-card">
      <h3>車款係數</h3>
      <p className="admin-muted">品牌＋車型一起判斷，例如 Toyota｜RAV4。沒有設定的車型一律使用 1.00。</p>
      {!rows && <p className="admin-muted">載入中…</p>}
      {rows && rows.length === 0 && <p className="admin-muted">還沒有設定任何車款係數。</p>}
      {rows && rows.length > 0 && (
        <ul className="rank">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{r.brand ? r.brand.name : '?'}｜{r.model}｜{Number(r.factor).toFixed(2)}</span>
              <span className="inline-actions" style={{ marginTop: 0 }}>
                <button onClick={() => setForm({ id: r.id, brandId: r.brand_id, model: r.model, factor: String(r.factor) })}>修改</button>
                <button className="danger" onClick={() => remove(r)}>刪除</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {form ? (
        <div className="admin-form">
          <label className="field"><span>品牌</span>
            <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
              <option value="">選擇品牌</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field"><span>車型（要和車型名稱完全相同）</span>
            <input list="model-factor-models" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="例如 RAV4" />
            <datalist id="model-factor-models">
              {models.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          </label>
          <label className="field"><span>係數</span>
            <input type="number" step="0.01" inputMode="decimal" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} placeholder="1.05" />
          </label>
          <div className="form-actions">
            <button className="btn btn-light" onClick={() => setForm(null)} disabled={busy}>取消</button>
            <button className="btn btn-dark" onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      ) : (
        <div className="inline-actions">
          <button onClick={() => setForm({ id: null, brandId: '', model: '', factor: '1.00' })}>＋ 新增車款係數</button>
        </div>
      )}
    </div>
  );
}

function ConditionFactors() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await getSupabase().from('condition_factors').select('*').order('sort_order');
    if (error) return alert('讀取失敗：' + error.message);
    setRows(data.map((r) => ({ ...r, factor: String(r.factor) })));
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    for (const r of rows) {
      const f = Number(r.factor);
      if (!Number.isFinite(f) || f <= 0) return alert('每個係數都要大於 0');
    }
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await getSupabase()
      .from('condition_factors')
      .upsert(rows.map((r) => ({ key: r.key, label_zh: r.label_zh, label_en: r.label_en, factor: Number(r.factor), sort_order: r.sort_order, updated_at: now })));
    setBusy(false);
    if (error) return alert('儲存失敗：' + error.message);
    alert('已儲存');
    load();
  }

  return (
    <div className="admin-card">
      <h3>車況係數</h3>
      <p className="admin-muted">網站估價目前一律以「正常」計算，車況實際確認後可在行情規則的估價試算中套用。</p>
      {!rows && <p className="admin-muted">載入中…</p>}
      {rows && rows.map((r, i) => (
        <div className="factor-row" key={r.key} style={{ gridTemplateColumns: '1fr 120px' }}>
          <span style={{ fontSize: 15 }}>{r.label_zh}</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={r.factor}
            onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))}
          />
        </div>
      ))}
      {rows && (
        <div className="form-actions">
          <button className="btn btn-dark btn-sm" onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存車況係數'}</button>
        </div>
      )}
    </div>
  );
}

function BrandEditor({ brand, onSaved }) {
  const [name, setName] = useState(brand.name);
  const [factor, setFactor] = useState(String(brand.brand_factor));
  const [active, setActive] = useState(brand.active);
  const [newModel, setNewModel] = useState('');
  const models = [...(brand.buyback_models || [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  async function save() {
    const f = Number(factor);
    if (!name.trim() || !Number.isFinite(f) || f <= 0) return alert('請確認品牌名稱與係數');
    const { error } = await getSupabase()
      .from('buyback_brands')
      .update({ name: name.trim(), brand_factor: f, active, updated_at: new Date().toISOString() })
      .eq('id', brand.id);
    if (error) return alert('儲存失敗：' + error.message);
    onSaved();
  }

  async function addModel() {
    const n = newModel.trim();
    if (!n) return;
    const sort = models.length ? Math.max(...models.map((m) => m.sort_order || 0)) + 1 : 1;
    const { error } = await getSupabase().from('buyback_models').insert({ brand_id: brand.id, name: n, sort_order: sort });
    if (error) return alert('新增失敗：' + error.message);
    setNewModel('');
    onSaved();
  }

  async function editModel(m) {
    const input = prompt(`修改車型名稱（清空並確定＝${m.active ? '停用' : '啟用'}）`, m.name);
    if (input === null) return;
    const patch = input.trim() ? { name: input.trim() } : { active: !m.active };
    const { error } = await getSupabase().from('buyback_models').update(patch).eq('id', m.id);
    if (error) return alert('更新失敗：' + error.message);
    onSaved();
  }

  return (
    <div className="admin-form">
      <div className="field-grid">
        <label className="field"><span>品牌名稱</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>品牌係數</span><input type="number" step="0.01" inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value)} /></label>
      </div>
      <label className="field"><span>狀態</span>
        <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
          <option value="1">啟用</option>
          <option value="0">停用</option>
        </select>
      </label>
      <div className="form-actions"><button className="btn btn-dark btn-sm" onClick={save}>儲存品牌</button></div>

      <p className="admin-muted" style={{ marginTop: 16 }}>車型（點一下可改名或停用，刪除線＝已停用）</p>
      <div className="chips">
        {models.map((m) => (
          <button key={m.id} className={m.active ? '' : 'off'} onClick={() => editModel(m)}>{m.name}</button>
        ))}
      </div>
      <div className="add-row">
        <input placeholder="新增車型" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
        <button className="btn btn-dark btn-sm" onClick={addModel}>新增</button>
      </div>
    </div>
  );
}

function FactorTable({ title, hint, table, minKey, maxKey, minLabel, maxLabel }) {
  const [rows, setRows] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await getSupabase().from(table).select('*').order(minKey);
    if (error) return alert('讀取失敗：' + error.message);
    setRows(data.map((r) => ({ ...r, [minKey]: String(r[minKey]), [maxKey]: r[maxKey] === null ? '' : String(r[maxKey]), factor: String(r.factor) })));
    setRemoved([]);
  }

  useEffect(() => {
    load();
  }, []);

  function update(i, key, value) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  async function save() {
    for (const r of rows) {
      if (toNum(r[minKey]) === null || !Number.isFinite(toNum(r.factor)) || toNum(r.factor) <= 0) {
        return alert('每一列都要有下限和大於 0 的係數');
      }
    }
    setBusy(true);
    const sb = getSupabase();
    if (removed.length) await sb.from(table).delete().in('id', removed);
    const now = new Date().toISOString();
    const payload = rows.map((r) => {
      const row = { [minKey]: toNum(r[minKey]), [maxKey]: toNum(r[maxKey]), factor: toNum(r.factor), active: true, updated_at: now };
      if (r.id) row.id = r.id;
      return row;
    });
    const existing = payload.filter((r) => r.id);
    const fresh = payload.filter((r) => !r.id);
    const results = await Promise.all([
      existing.length ? sb.from(table).upsert(existing) : Promise.resolve({}),
      fresh.length ? sb.from(table).insert(fresh) : Promise.resolve({}),
    ]);
    setBusy(false);
    const err = results.find((r) => r.error);
    if (err) return alert('儲存失敗：' + err.error.message);
    load();
  }

  return (
    <div className="admin-card">
      <h3>{title}</h3>
      <p className="admin-muted">{hint}</p>
      {!rows && <p className="admin-muted">載入中…</p>}
      {rows && (
        <>
          <div className="factor-head"><span>{minLabel}</span><span>{maxLabel}</span><span>係數</span><span /></div>
          {rows.map((r, i) => (
            <div className="factor-row" key={r.id || `new-${i}`}>
              <input type="number" inputMode="numeric" value={r[minKey]} onChange={(e) => update(i, minKey, e.target.value)} />
              <input type="number" inputMode="numeric" placeholder="以上" value={r[maxKey]} onChange={(e) => update(i, maxKey, e.target.value)} />
              <input type="number" step="0.01" inputMode="decimal" value={r.factor} onChange={(e) => update(i, 'factor', e.target.value)} />
              <button
                className="icon-btn"
                aria-label="刪除這一列"
                onClick={() => {
                  if (r.id) setRemoved((x) => [...x, r.id]);
                  setRows((prev) => prev.filter((_, j) => j !== i));
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="inline-actions">
            <button onClick={() => setRows([...rows, { [minKey]: '', [maxKey]: '', factor: '1' }])}>＋ 新增一列</button>
          </div>
          <div className="form-actions">
            <button className="btn btn-dark btn-sm" onClick={save} disabled={busy}>{busy ? '儲存中…' : `儲存${title}`}</button>
          </div>
        </>
      )}
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabase().from('buyback_settings').select('*').eq('id', 1).maybeSingle();
      const v = { ...DEFAULT_SETTINGS, ...(data || {}) };
      setS({
        min_year: String(v.min_year),
        spread_low: String(v.spread_low),
        spread_high: String(v.spread_high),
        market_low: String(v.market_low),
        market_high: String(v.market_high),
        retail_low: String(v.retail_low),
        retail_high: String(v.retail_high),
        round_to: String(v.round_to),
        stale_days: String(v.stale_days),
      });
    })();
  }, []);

  async function save() {
    const row = {
      id: 1,
      min_year: Math.round(toNum(s.min_year)),
      spread_low: toNum(s.spread_low),
      spread_high: toNum(s.spread_high),
      market_low: toNum(s.market_low),
      market_high: toNum(s.market_high),
      retail_low: toNum(s.retail_low),
      retail_high: toNum(s.retail_high),
      round_to: Math.round(toNum(s.round_to)),
      stale_days: Math.round(toNum(s.stale_days)),
      updated_at: new Date().toISOString(),
    };
    if (Object.values(row).some((v) => v === null || Number.isNaN(v))) return alert('每個欄位都要填寫');
    if (row.spread_low >= row.spread_high || row.market_low >= row.market_high || row.retail_low >= row.retail_high) {
      return alert('每一組的下緣都要小於上緣');
    }
    setBusy(true);
    const { error } = await getSupabase().from('buyback_settings').upsert(row);
    setBusy(false);
    if (error) return alert('儲存失敗：' + error.message);
    alert('已儲存');
  }

  if (!s) return null;
  const set = (key) => ({ value: s[key], onChange: (e) => setS({ ...s, [key]: e.target.value }) });

  return (
    <div className="admin-card">
      <h3>估價設定</h3>
      <p className="admin-muted">
        網站上的三種價格，都是用「預估市場行情」乘上下面的比例，給客人一個大概範圍。
        例如預估市場行情 1,000,000：市場行情價 0.92～1.08 顯示 920,000 – 1,080,000；
        預估對客售價 1.00～1.10 顯示 1,000,000 – 1,100,000；車商建議收購價 0.80～0.88 顯示 800,000 – 880,000。
      </p>
      <div className="field-grid">
        <label className="field"><span>市場行情價・下緣</span><input type="number" step="0.01" inputMode="decimal" {...set('market_low')} /></label>
        <label className="field"><span>市場行情價・上緣</span><input type="number" step="0.01" inputMode="decimal" {...set('market_high')} /></label>
        <label className="field"><span>預估對客售價・下緣</span><input type="number" step="0.01" inputMode="decimal" {...set('retail_low')} /></label>
        <label className="field"><span>預估對客售價・上緣</span><input type="number" step="0.01" inputMode="decimal" {...set('retail_high')} /></label>
        <label className="field"><span>車商建議收購價・下緣</span><input type="number" step="0.01" inputMode="decimal" {...set('spread_low')} /></label>
        <label className="field"><span>車商建議收購價・上緣</span><input type="number" step="0.01" inputMode="decimal" {...set('spread_high')} /></label>
        <label className="field"><span>年份選單最早年份</span><input type="number" inputMode="numeric" {...set('min_year')} /></label>
        <label className="field"><span>取整到（元）</span><input type="number" inputMode="numeric" {...set('round_to')} /></label>
        <label className="field"><span>行情多少天沒更新要提醒</span><input type="number" inputMode="numeric" {...set('stale_days')} /></label>
      </div>
      <div className="form-actions">
        <button className="btn btn-dark btn-sm" onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存設定'}</button>
      </div>
    </div>
  );
                          }
