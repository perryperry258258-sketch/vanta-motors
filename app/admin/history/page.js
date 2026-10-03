'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { parseCSV } from '../../../lib/buyback/csv';
import { normalizePrice, priceTypeOf, pickHistorical } from '../../../lib/buyback/history';

export default function HistoryPage() {
  return (
    <AdminShell adminOnly>
      <History />
    </AdminShell>
  );
}

const YEARS = 15; // 2012～2026
const nt = (n) => (n ? `NT$${Number(n).toLocaleString('en-US')}` : '—');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function loadAll(sb) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('historical_vehicle_prices')
      .select('brand, model, year, version, reference_price, confidence, price_type, source, source_url, notes, unit_normalized')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function History() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [q, setQ] = useState({ brand: 'Toyota', model: 'RAV4', year: '2021', version: '' });

  async function load() {
    try {
      setRows(await loadAll(getSupabase()));
    } catch (e) {
      setError('讀取失敗：' + e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    if (!rows) return null;
    const priced = rows.filter((r) => r.reference_price > 0);
    const original = priced.filter((r) => r.price_type === 'original').length;
    const inferred = priced.filter((r) => r.price_type === 'inferred').length;
    const years = rows.map((r) => r.year);
    const models = new Set(rows.map((r) => `${r.brand}|${r.model}`));
    const covered = new Set(priced.map((r) => `${r.brand}|${r.model}|${r.year}`));
    const coveredOriginal = new Set(priced.filter((r) => r.price_type === 'original').map((r) => `${r.brand}|${r.model}|${r.year}`));
    return {
      total: rows.length,
      original,
      inferred,
      unavailable: rows.length - priced.length,
      normalized: rows.filter((r) => r.unit_normalized).length,
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null,
      brands: new Set(rows.map((r) => r.brand)).size,
      models: models.size,
      completeness: models.size ? (covered.size / (models.size * YEARS)) * 100 : 0,
      originalCoverage: models.size ? (coveredOriginal.size / (models.size * YEARS)) * 100 : 0,
    };
  }, [rows]);

  async function importCSV(file) {
    if (!file) return;
    setBusy(true);
    setReport(null);
    const errors = [];
    let normalized = 0;
    try {
      const table = parseCSV(await file.text());
      const header = table[0].map((h) => h.trim().replace(/^\uFEFF/, '').toLowerCase());
      const col = (r, k) => {
        const i = header.indexOf(k);
        return i === -1 ? '' : String(r[i] ?? '').trim();
      };
      for (const k of ['brand', 'model', 'year', 'reference_price']) {
        if (!header.includes(k)) throw new Error(`缺少欄位 ${k}`);
      }
      const byKey = new Map();
      for (let i = 1; i < table.length; i++) {
        const r = table[i];
        if (r.length < 2) continue;
        const year = Number(col(r, 'year'));
        const brand = col(r, 'brand');
        const model = col(r, 'model');
        const n = normalizePrice(col(r, 'reference_price'));
        if (!brand || !model || !Number.isInteger(year)) {
          errors.push(`第 ${i + 1} 列：缺少品牌、車型或年份`);
          continue;
        }
        if (n.normalized) normalized++;
        const confidence = col(r, 'confidence');
        const date = col(r, 'source_updated_at');
        const rec = {
          brand,
          model,
          year,
          version: col(r, 'version'),
          reference_price: n.price,
          reference_price_raw: col(r, 'reference_price'),
          unit_normalized: n.normalized,
          confidence: confidence || null,
          price_type: n.price ? priceTypeOf(confidence) : 'unavailable',
          source: col(r, 'source') || null,
          source_url: col(r, 'source_url') || null,
          source_type: col(r, 'source_type') || null,
          source_updated_at: DATE_RE.test(date) ? date : null,
          notes: col(r, 'notes') || null,
          updated_at: new Date().toISOString(),
        };
        byKey.set(`${brand}|${model}|${year}|${rec.version}`, rec);
      }
      const recs = [...byKey.values()];
      const sb = getSupabase();
      let done = 0;
      for (let i = 0; i < recs.length; i += 500) {
        const batch = recs.slice(i, i + 500);
        const { error } = await sb.from('historical_vehicle_prices').upsert(batch, { onConflict: 'brand,model,year,version' });
        if (error) errors.push(`第 ${i + 1}～${i + batch.length} 筆寫入失敗：${error.message}`);
        else done += batch.length;
      }
      setReport({ done, normalized, dupes: table.length - 1 - recs.length - errors.filter((e) => e.includes('缺少')).length, errors });
      await load();
    } catch (e) {
      setReport({ done: 0, normalized, dupes: 0, errors: [e.message || String(e)] });
    }
    setBusy(false);
  }

  const test = useMemo(() => {
    if (!rows || !q.brand || !q.model || !q.year) return null;
    const mine = rows.filter((r) => r.brand === q.brand && r.model === q.model);
    return pickHistorical(mine, { year: Number(q.year), version: q.version });
  }, [rows, q]);

  const set = (k) => ({ value: q[k], onChange: (e) => setQ({ ...q, [k]: e.target.value }) });

  return (
    <>
      <h1>歷史新車價</h1>
      <p className="admin-muted">
        各車型、版本在當年作為新車時的價格基準，估價時會先查這裡，再搭配車齡、里程、目前同款車源算出中古車行情。
        original＝有歷史資料來源；inferred＝依鄰近年份或同車型補值，前台會顯示「約」與「估算」，不會寫成官方售價。
      </p>

      <div className="admin-card">
        <h3>資料健康度｜Historical Price Database</h3>
        {error && <p className="admin-error">{error}</p>}
        {!stats && !error && <p className="admin-muted">載入中…</p>}
        {stats && (
          <ul className="rank">
            <li><span>總資料</span><span>{stats.total.toLocaleString()} 筆</span></li>
            <li><span>Original（有來源）</span><span>{stats.original.toLocaleString()} 筆</span></li>
            <li><span>Inferred（推估補值）</span><span>{stats.inferred.toLocaleString()} 筆</span></li>
            <li><span>Unavailable（無價格）</span><span>{stats.unavailable.toLocaleString()} 筆</span></li>
            <li><span>匯入時由「萬元」換算成元</span><span>{stats.normalized.toLocaleString()} 筆</span></li>
            <li><span>涵蓋年份</span><span>{stats.yearMin ? `${stats.yearMin}～${stats.yearMax}` : '—'}</span></li>
            <li><span>涵蓋品牌</span><span>{stats.brands}</span></li>
            <li><span>涵蓋車型</span><span>{stats.models}</span></li>
            <li><span>歷史新車價格完整度（含推估）</span><span>{stats.completeness.toFixed(1)}%</span></li>
            <li><span>有原始來源的年份比例</span><span>{stats.originalCoverage.toFixed(1)}%</span></li>
          </ul>
        )}
        <p className="admin-muted" style={{ marginTop: 10 }}>完整度＝有價格的「車型＋年份」組合 ÷（車型數 × 15 個年份）。</p>
      </div>

      <div className="admin-card">
        <h3>匯入 CSV</h3>
        <p className="admin-muted">
          欄位：brand, model, year, version, reference_price, source, source_url, source_updated_at, source_type, confidence, notes。
          同品牌＋車型＋年份＋版本會用新資料取代。價格小於 10,000 的會視為「萬元」自動換算成元，原始數字另外保存。
        </p>
        <div className="inline-actions">
          <label>
            {busy ? '匯入中…' : '選擇 CSV 匯入'}
            <input className="hidden-input" type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { importCSV(e.target.files && e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
        {report && (
          <div className="result-box">
            成功寫入 {report.done.toLocaleString()} 筆（其中 {report.normalized.toLocaleString()} 筆由萬元換算）
            {report.dupes > 0 && `，檔案內重複 ${report.dupes} 列以後面為準`}
            {report.errors.length > 0 && <>，{report.errors.length} 個問題：{report.errors.slice(0, 20).map((e) => <div key={e}>・{e}</div>)}</>}
          </div>
        )}
      </div>

      <div className="admin-card">
        <h3>查詢測試</h3>
        <div className="field-grid">
          <label className="field"><span>品牌</span><input {...set('brand')} /></label>
          <label className="field"><span>車型</span><input {...set('model')} /></label>
          <label className="field"><span>年份</span><input type="number" inputMode="numeric" {...set('year')} /></label>
          <label className="field"><span>版本（選填）</span><input {...set('version')} /></label>
        </div>
        {rows && (
          <div className="result-box">
            {!test ? '找不到這個品牌＋車型的歷史新車價（回傳 null，估價會改用原本的行情規則）' : (
              <>
                <div className="money-row"><span>歷史新車價</span><span>{test.price_type === 'original' ? '' : '約 '}{nt(test.price)}</span></div>
                <div className="money-row"><span>price_type</span><span>{test.price_type}</span></div>
                <div className="money-row"><span>confidence</span><span>{test.confidence}</span></div>
                <div className="money-row"><span>比對方式</span><span>{{ version: '版本完全相符', year: `同年份${test.versionCount > 1 ? `（${test.versionCount} 個版本中位數）` : ''}`, nearest_year: `最近年份 ${test.priceYear}` }[test.match]}</span></div>
                {test.version && <div className="money-row"><span>版本</span><span>{test.version}</span></div>}
                <div className="money-row"><span>來源</span><span>{test.source || '—'}</span></div>
                {test.source_url && <a href={test.source_url} target="_blank" rel="noopener noreferrer" className="text-link">開啟來源網址</a>}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
          }
