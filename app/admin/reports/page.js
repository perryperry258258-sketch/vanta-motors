'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { fetchAll } from '../../../lib/fetchAll';
import { SETTLEMENT_LABEL, nt } from '../../../lib/deal';
import { SOURCE_LABEL } from '../../../lib/case';
import { SOURCES, SOURCE_LABEL as UTM_LABEL, MEDIUMS, MEDIUM_LABEL, buildTrackedUrl } from '../../../lib/source';
import '../../../styles/viewing.css';

export default function ReportsPage() {
  return (
    <AdminShell adminOnly>
      <Reports />
    </AdminShell>
  );
}

// 台灣時間的年月，例如 2026-10
const ym = (v) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).format(new Date(v)).slice(0, 7);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
const sum = (list, f) => list.reduce((n, x) => n + (Number(f(x)) || 0), 0);

// 分潤報表：依月份統計成交、三方分潤、各車商與各業務
function Reports() {
  const [month, setMonth] = useState(ym(Date.now()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const [sales, cases, partners, dealers] = await Promise.all([
          fetchAll(() =>
            sb.from('sales')
              .select('id, sale_price, sale_date, verification, partner_id, updated_at, case:cases!sales_case_id_fkey(case_no, subject, utm_source), settlement:settlements!settlements_sale_id_fkey(*)')
              .order('id')
          ),
          fetchAll(() => sb.from('cases').select('id, type, source, status, partner_id, created_at, utm_source, utm_medium').order('id')),
          sb.from('partners').select('id, name, dealer_id').order('name'),
          sb.from('dealers').select('id, name').order('name'),
        ]);
        setData({
          sales: sales.map((s) => ({ ...s, settlement: Array.isArray(s.settlement) ? s.settlement[0] : s.settlement })),
          cases,
          partners: partners.data || [],
          dealers: dealers.data || [],
        });
      } catch (e) {
        setError('讀取失敗：' + e.message);
      }
    })();
  }, []);

  const months = useMemo(() => {
    const set = new Set([ym(Date.now())]);
    (data ? data.sales : []).forEach((s) => set.add(ym(s.sale_date || s.updated_at)));
    return [...set].sort().reverse();
  }, [data]);

  const r = useMemo(() => {
    if (!data) return null;
    const partnerOf = Object.fromEntries(data.partners.map((p) => [p.id, p]));
    const dealerName = Object.fromEntries(data.dealers.map((d) => [d.id, d.name]));
    // 本月成交：雙方確認、已建立結算、成交日期在這個月
    const deals = data.sales.filter((s) => s.verification === 'confirmed' && s.settlement && ym(s.sale_date || s.updated_at) === month);
    const st = (s) => s.settlement;
    const monthCases = data.cases.filter((c) => ym(c.created_at) === month && c.type !== 'sell');

    const byDealer = new Map();
    const byPartner = new Map();
    deals.forEach((s) => {
      const dKey = st(s).dealer_id || '_none';
      const d = byDealer.get(dKey) || { name: dealerName[st(s).dealer_id] || '⚠️ 未設定車商', count: 0, profit: 0, share: 0 };
      d.count += 1;
      d.profit += Number(st(s).gross_profit) || 0;
      d.share += Number(st(s).dealer_share) || 0;
      byDealer.set(dKey, d);
      const p = byPartner.get(s.partner_id) || { name: (partnerOf[s.partner_id] || {}).name || '未知', count: 0, share: 0 };
      p.count += 1;
      p.share += Number(st(s).partner_share) || 0;
      byPartner.set(s.partner_id, p);
    });
    // 每位業務本月接到的案件數（成交率 = 成交數 ÷ 接案數）
    monthCases.forEach((c) => {
      if (!c.partner_id) return;
      const p = byPartner.get(c.partner_id) || { name: (partnerOf[c.partner_id] || {}).name || '未知', count: 0, share: 0 };
      p.cases = (p.cases || 0) + 1;
      byPartner.set(c.partner_id, p);
    });

    const sources = {};
    monthCases.forEach((c) => {
      sources[c.source] = (sources[c.source] || 0) + 1;
    });

    // 行銷來源：本月新案件（含賣車）從哪個管道來、成交幾台、帶來多少 VANTA 分潤
    const byUtm = new Map();
    const utmKey = (v) => v || '_none';
    data.cases.filter((c) => ym(c.created_at) === month).forEach((c) => {
      const k = utmKey(c.utm_source);
      const x = byUtm.get(k) || { key: k, cases: 0, won: 0, deals: 0, vanta: 0 };
      x.cases += 1;
      if (c.status === 'won') x.won += 1;
      byUtm.set(k, x);
    });
    deals.forEach((s) => {
      const k = utmKey(s.case && s.case.utm_source);
      const x = byUtm.get(k) || { key: k, cases: 0, won: 0, deals: 0, vanta: 0 };
      x.deals += 1;
      x.vanta += Number(st(s).vanta_share) || 0;
      byUtm.set(k, x);
    });

    return {
      deals,
      newCases: monthCases.length,
      wonCases: monthCases.filter((c) => c.status === 'won').length,
      revenue: sum(deals, (s) => st(s).sale_price),
      cost: sum(deals, (s) => st(s).total_cost),
      profit: sum(deals, (s) => st(s).gross_profit),
      vanta: sum(deals, (s) => st(s).vanta_share),
      dealer: sum(deals, (s) => st(s).dealer_share),
      partner: sum(deals, (s) => st(s).partner_share),
      statusCount: deals.reduce((o, s) => ({ ...o, [st(s).settlement_status]: (o[st(s).settlement_status] || 0) + 1 }), {}),
      byDealer: [...byDealer.values()].sort((a, b) => b.share - a.share),
      byPartner: [...byPartner.values()].sort((a, b) => b.count - a.count || (b.cases || 0) - (a.cases || 0)),
      sources: Object.entries(sources).sort((a, b) => b[1] - a[1]),
      byUtm: [...byUtm.values()].sort((a, b) => b.cases - a.cases),
      dealerName,
      partnerOf,
    };
  }, [data, month]);

  // 下載本月結算明細（對帳用，Excel 可以直接打開）
  function downloadCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['案件編號', '車輛', '成交日期', '成交價', '核准成本', '可分配利潤', '車商', '車商分潤', '業務', '業務分潤', 'VANTA 分潤', '結算狀態', '結算日'];
    const body = r.deals.map((s) => {
      const t = s.settlement;
      return [
        s.case && s.case.case_no, s.case && s.case.subject, s.sale_date, t.sale_price, t.total_cost, t.gross_profit,
        r.dealerName[t.dealer_id] || '未設定', t.dealer_share, (r.partnerOf[s.partner_id] || {}).name, t.partner_share, t.vanta_share,
        SETTLEMENT_LABEL[t.settlement_status] || t.settlement_status, t.settlement_date,
      ];
    });
    const csv = '\uFEFF' + [head, ...body].map((row) => row.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `VANTA_分潤報表_${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <h1>分潤報表</h1>
      <p className="admin-muted">只計算車源業務回報、客戶也確認的成交。成交月份以成交日期為準。</p>
      {error && <p className="admin-error">{error}</p>}
      {!data && !error && <p className="admin-muted">載入中…</p>}

      {r && (
        <>
          <label className="field"><span>月份</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <div className="admin-card">
            <h3>{month} 總覽</h3>
            <ul className="rank">
              <li><span>新案件（買車、找車）</span><span>{r.newCases} 件</span></li>
              <li><span>成交</span><span>{r.deals.length} 台</span></li>
              <li><span>本月新案件成交率</span><span>{pct(r.wonCases, r.newCases)}</span></li>
              <li><span>成交總額</span><span>{nt(r.revenue)}</span></li>
              <li><span>核准成本</span><span>{nt(r.cost)}</span></li>
              <li><span>可分配利潤</span><span>{nt(r.profit)}</span></li>
            </ul>
            <div className="money-split money-split-3" style={{ marginTop: 12 }}>
              <div><span>車商</span><strong>{nt(r.dealer)}</strong></div>
              <div><span>業務</span><strong>{nt(r.partner)}</strong></div>
              <div><span>VANTA</span><strong>{nt(r.vanta)}</strong></div>
            </div>
            <p className="admin-muted" style={{ marginTop: 10 }}>
              結算狀態：{Object.entries(r.statusCount).map(([k, n]) => `${SETTLEMENT_LABEL[k] || k} ${n}`).join('、') || '—'}
            </p>
            {r.deals.length > 0 && (
              <div className="inline-actions"><button onClick={downloadCsv}>下載本月結算明細（CSV）</button></div>
            )}
          </div>

          <div className="admin-card">
            <h3>各車商</h3>
            {r.byDealer.length === 0 && <p className="admin-muted">本月沒有成交。</p>}
            <ul className="rank">
              {r.byDealer.map((d) => (
                <li key={d.name}><span>{d.name}｜{d.count} 台</span><span>{nt(d.share)}</span></li>
              ))}
            </ul>
          </div>

          <div className="admin-card">
            <h3>各業務</h3>
            {r.byPartner.length === 0 && <p className="admin-muted">本月沒有案件。</p>}
            <ul className="rank">
              {r.byPartner.map((p) => (
                <li key={p.name} style={{ display: 'block' }}>
                  <span>{p.name}</span>
                  <br />
                  <span className="admin-muted">
                    本月接案 {p.cases || 0} 件｜成交 {p.count} 台｜成交率 {pct(p.count, p.cases || 0)}｜分潤 {nt(p.share)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-card">
            <h3>案件來源</h3>
            {r.sources.length === 0 && <p className="admin-muted">本月沒有案件。</p>}
            <ul className="rank">
              {r.sources.map(([k, n]) => (
                <li key={k}><span>{SOURCE_LABEL[k] || k}</span><span>{n} 件（{pct(n, r.newCases)}）</span></li>
              ))}
            </ul>
          </div>

          <div className="admin-card">
            <h3>行銷來源</h3>
            <p className="admin-muted">客人從哪個管道來到網站（IG、FB、Google…）。「直接加 LINE／未知」是沒有經過網站、或直接打網址進來的客人。</p>
            {r.byUtm.length === 0 && <p className="admin-muted">本月沒有案件。</p>}
            <ul className="rank">
              {r.byUtm.map((x) => (
                <li key={x.key} style={{ display: 'block' }}>
                  <span>{x.key === '_none' ? '直接加 LINE／未知' : UTM_LABEL[x.key] || x.key}</span>
                  <br />
                  <span className="admin-muted">
                    新案件 {x.cases} 件｜成交 {x.deals} 台｜成交率 {pct(x.won, x.cases)}｜VANTA 分潤 {nt(x.vanta)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <LinkBuilder />

          {r.deals.length > 0 && (
            <div className="admin-card">
              <h3>本月成交明細</h3>
              {r.deals.map((s) => {
                const t = s.settlement;
                return (
                  <div className="question-done" key={s.id}>
                    <p><strong>{s.case && s.case.case_no}</strong>｜{s.case && s.case.subject}</p>
                    <p className="admin-muted">
                      成交 {nt(t.sale_price)}｜利潤 {nt(t.gross_profit)}｜{SETTLEMENT_LABEL[t.settlement_status] || t.settlement_status}
                    </p>
                    <p className="admin-muted">
                      {r.dealerName[t.dealer_id] || '未設定車商'} {nt(t.dealer_share)}｜{(r.partnerOf[s.partner_id] || {}).name} {nt(t.partner_share)}｜VANTA {nt(t.vanta_share)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

// 產生追蹤連結：貼到 IG、FB、廣告的網址加上來源，之後在「行銷來源」看得到效果
function LinkBuilder() {
  const [form, setForm] = useState({ page: 'https://vantamotors.tw/zh', source: 'instagram', medium: 'post', campaign: '' });
  const [copied, setCopied] = useState(false);
  const url = buildTrackedUrl(form.page.trim(), form.source, form.medium, form.campaign.trim());
  const set = (k) => (e) => {
    setCopied(false);
    setForm({ ...form, [k]: e.target.value });
  };
  return (
    <div className="admin-card">
      <h3>產生追蹤連結</h3>
      <p className="admin-muted">要貼到 IG、FB、廣告的網址，先在這裡產生，系統就能分辨客人是從哪裡來的。</p>
      <label className="field"><span>網址（首頁、在售車輛或某台車的網址）</span><input value={form.page} onChange={set('page')} /></label>
      <div className="field-grid">
        <label className="field"><span>平台</span>
          <select value={form.source} onChange={set('source')}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="field"><span>類型</span>
          <select value={form.medium} onChange={set('medium')}>{MEDIUMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>
      <label className="field"><span>活動名稱（選填，英文或數字，例如 2026-10-reels）</span><input value={form.campaign} onChange={set('campaign')} /></label>
      {url ? (
        <>
          <p className="result-box" style={{ wordBreak: 'break-all' }}>{url}</p>
          <div className="inline-actions">
            <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? '已複製' : '複製連結'}</button>
          </div>
          <p className="admin-muted">類型「{MEDIUM_LABEL[form.medium]}」。IG 個人檔案的網站連結，建議換成平台 Instagram＋類型「個人檔案連結」的版本。</p>
        </>
      ) : (
        <p className="admin-error">網址格式不正確，請包含 https://</p>
      )}
    </div>
  );
                          }
