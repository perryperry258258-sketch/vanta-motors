'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminShell, { useRole } from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import '../../../styles/viewing.css';

export default function MarketGapsPage() {
  return (
    <AdminShell>
      <Gaps />
    </AdminShell>
  );
}

const REASONS = [
  ['no_year', '沒有年份', '在車輛編輯頁補上年份。'],
  ['brand', '品牌對不到', '品牌欄空白或寫法不同（例如中文品牌）。請在車輛編輯頁把品牌改成英文，例如 Toyota、BMW。'],
  ['model', '車型對不到', '車型不在行情資料庫，或車名寫法系統認不得。按「下載 CSV」傳給 Claude，可以補車型或加別名。'],
  ['no_price', '有車型、沒有新車價', '車型對到了，但歷史新車價資料庫沒有這個車型的價格。按「下載 CSV」傳給 Claude 補新車價。'],
  ['hidden', '性能版不公開', '性能版或特殊版（GT4、GTS、AMG、M、RS 等）沒有對到同版本的新車價，系統估價容易低估，所以網站不顯示行情。按「下載 CSV」傳給 Claude 補該版本新車價。'],
];
const LABEL = Object.fromEntries(REASONS.map(([k, l]) => [k, l]));
const STATUS = { published: '上架', draft: '草稿', unlisted: '下架' };
const wan = (n) => `${Math.round(n / 1000) / 10}`;
const compact = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function Gaps() {
  const { session } = useRole();
  const [scope, setScope] = useState('published');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('missing');
  const [copied, setCopied] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => setCopied(false), [tab, scope]);

  useEffect(() => {
    setRows(null);
    setError('');
    fetch(`/api/admin/market-gaps?scope=${scope}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setRows(d.rows)))
      .catch((e) => setError(e.message));
  }, [scope, session.access_token, reload]);

  // 車型欄寫的不是車型（例如 Bose、K14、CC、空白），但系統已經對到正確車型 → 可以一鍵改成正確車型
  const fixable = (rows || []).filter(
    (r) => r.matchedModel && (compact(r.model) !== compact(r.matchedModel) || (r.matchedBrand && r.brand !== r.matchedBrand))
  );

  async function fixModels() {
    if (!confirm(`把 ${fixable.length} 台車的品牌／車型欄改成系統對應的名稱？車名不會改。`)) return;
    setFixing(true);
    setFixMsg('');
    const sb = getSupabase();
    let ok = 0;
    const failed = [];
    for (const r of fixable) {
      const { error } = await sb.from('cars').update({ model: r.matchedModel, brand: r.matchedBrand || r.brand }).eq('id', r.id);
      if (error) failed.push(`${r.title}：${error.message}`);
      else ok += 1;
    }
    setFixMsg(failed.length ? `已修正 ${ok} 台；${failed.length} 台失敗：${failed.join('；')}` : `已修正 ${ok} 台的品牌／車型欄。`);
    setFixing(false);
    setReload((n) => n + 1);
  }

  const counts = useMemo(() => {
    const c = { ok: 0, missing: 0 };
    (rows || []).forEach((r) => {
      if (r.reason === 'ok') c.ok += 1;
      else {
        c.missing += 1;
        c[r.reason] = (c[r.reason] || 0) + 1;
      }
    });
    return c;
  }, [rows]);

  const list = (rows || []).filter((r) => (tab === 'missing' ? r.reason !== 'ok' : r.reason === tab));
  // 下載 CSV（Excel 可以直接打開），方便整份傳給 Claude
  function downloadCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['原因', '車名', '品牌欄', '車型欄', '年份', '系統對應品牌', '系統對應車型', '狀態', '車輛ID'];
    const body = list.map((r) => [
      r.reason === 'ok' ? '有行情' : LABEL[r.reason], r.title, r.brand, r.model, r.year, r.matchedBrand, r.matchedModel, STATUS[r.status] || r.status, r.id,
    ]);
    const csv = '\uFEFF' + [head, ...body].map((row) => row.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `VANTA_行情缺漏_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 把目前分頁的清單複製成文字，方便貼給 Claude 補車型或新車價
  function copyList() {
    const text = list.map((r) => `${r.reason === 'ok' ? '有行情' : LABEL[r.reason]}｜${r.title}｜品牌欄 ${r.brand || '空白'}｜車型欄 ${r.model || '空白'}｜年份 ${r.year || '空白'}`).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {});
  }

  return (
    <>
      <h1>行情缺漏檢查</h1>
      <p className="admin-muted">列出算不出市場行情的車輛，以及原因。修正後重新整理這頁就會更新。</p>
      <div className="tabs">
        <button aria-pressed={scope === 'published'} onClick={() => setScope('published')}>只看上架中</button>
        <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>包含草稿、下架</button>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!rows && !error && <p className="admin-muted">檢查中…</p>}

      {rows && (
        <>
          <div className="admin-card">
            <ul className="rank">
              <li><span>檢查車輛</span><span>{rows.length} 台</span></li>
              <li><span>✅ 有行情</span><span>{counts.ok} 台</span></li>
              <li><span>⚠️ 沒有行情</span><span>{counts.missing} 台</span></li>
            </ul>
          </div>
          {fixable.length > 0 && (
            <div className="admin-card">
              <h3>車型欄需要整理：{fixable.length} 台</h3>
              <p className="admin-muted">
                這些車的車型欄寫的是配備或簡稱（例如 Bose、K14、CC），系統已經從車名判斷出正確車型。整理後車型欄會一致，網站篩選與統計也比較準確，車名不會改。
              </p>
              <details className="viewing-history">
                <summary>看會改哪些</summary>
                <ul className="rank">
                  {fixable.map((r) => (
                    <li key={r.id} style={{ display: 'block' }}>
                      <span>{r.title}</span>
                      <br />
                      <span className="admin-muted">{r.brand || '（空白）'} {r.model || '（空白）'} → {r.matchedBrand} {r.matchedModel}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="case-actions">
                <button className="btn btn-dark" onClick={fixModels} disabled={fixing}>{fixing ? '整理中…' : `一鍵整理 ${fixable.length} 台`}</button>
              </div>
              {fixMsg && <p className="result-box">{fixMsg}</p>}
            </div>
          )}
          <div className="tabs">
            <button aria-pressed={tab === 'missing'} onClick={() => setTab('missing')}>全部缺漏 {counts.missing}</button>
            {REASONS.map(([k, l]) => (
              <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l} {counts[k] || 0}</button>
            ))}
            <button aria-pressed={tab === 'ok'} onClick={() => setTab('ok')}>有行情 {counts.ok}</button>
          </div>
          {REASONS.filter(([k]) => k === tab).map(([k, l, how]) => <p key={k} className="admin-muted">怎麼修：{how}</p>)}
          {list.length > 0 && (
            <div className="inline-actions">
              <button onClick={downloadCsv}>下載這 {list.length} 台（CSV）</button>
              <button onClick={copyList}>{copied ? `已複製 ${list.length} 台，可以貼給 Claude` : '複製清單'}</button>
            </div>
          )}
          {list.length === 0 && <p className="admin-muted">這裡沒有車輛。</p>}
          {list.map((r) => (
            <div className="case-card" key={r.id}>
              <div className="case-card-top">
                <span className="case-no">{STATUS[r.status] || r.status}</span>
                <span className={`badge badge-${r.reason === 'ok' ? 'ok' : 'warn'}`}>{r.reason === 'ok' ? '有行情' : LABEL[r.reason]}</span>
              </div>
              <h3>{r.title}</h3>
              <p className="lead-meta">
                品牌欄：{r.brand || '（空白）'}｜車型欄：{r.model || '（空白）'}｜年份：{r.year || '（空白）'}
                <br />
                系統對應：{r.matchedBrand || '—'} {r.matchedModel ? `｜${r.matchedModel}` : ''}
                {r.market ? `｜行情 ${wan(r.market.low)}～${wan(r.market.high)} 萬` : ''}
              </p>
              <div className="inline-actions"><Link href={`/admin/edit?id=${r.id}`}>編輯車輛</Link></div>
            </div>
          ))}
        </>
      )}
    </>
  );
            }
