'use client';

import { useEffect, useState } from 'react';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase } from '../../../lib/supabase';
import { DEFAULT_SETTINGS } from '../../../lib/buyback/engine';

export default function BuybackDashboardPage() {
  return (
    <AdminShell>
      <Dashboard />
    </AdminShell>
  );
}

const nt = (n) => (n || n === 0 ? `NT$${Math.round(n).toLocaleString('en-US')}` : '—');
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');

function kmBucket(km) {
  if (km < 30000) return '3萬以下';
  if (km < 50000) return '3～5萬';
  if (km < 80000) return '5～8萬';
  if (km < 100000) return '8～10萬';
  return '10萬以上';
}

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function topCounts(rows, keyFn, limit = 8) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (k) map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function errorGroups(purchases, keyFn) {
  const map = new Map();
  purchases.forEach((p) => {
    const k = keyFn(p);
    const g = map.get(k) || { n: 0, abs: 0, signed: 0, inRange: 0 };
    g.n++;
    g.abs += Math.abs(p.err);
    g.signed += p.err;
    if (p.inRange) g.inRange++;
    map.set(k, g);
  });
  return [...map.entries()]
    .map(([k, g]) => ({ key: k, n: g.n, abs: g.abs / g.n, signed: g.signed / g.n, inRange: g.inRange / g.n }))
    .sort((a, b) => b.n - a.n);
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState('brand');

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const month = new Date(now.getFullYear(), now.getMonth(), 1);
        const since30 = new Date(Date.now() - 30 * 864e5);
        const count = (q) => q.then((r) => {
          if (r.error) throw r.error;
          return r.count || 0;
        });
        const head = { count: 'exact', head: true };

        const [estToday, leadsToday, clicksToday, estMonth, leadsMonth, buyMonth, recent, purchases, rules, settings] =
          await Promise.all([
            count(sb.from('buyback_estimates').select('id', head).gte('created_at', today.toISOString())),
            count(sb.from('buyback_leads').select('id', head).gte('created_at', today.toISOString())),
            count(sb.from('buyback_line_clicks').select('id', head).gte('created_at', today.toISOString())),
            count(sb.from('buyback_estimates').select('id', head).gte('created_at', month.toISOString())),
            count(sb.from('buyback_leads').select('id', head).gte('created_at', month.toISOString())),
            count(sb.from('actual_purchases').select('id', head).eq('final_status', 'purchased').gte('purchased_at', localDate(month))),
            sb.from('buyback_estimates').select('brand_name, model_name, estimated_center, match_quality').gte('created_at', since30.toISOString()).limit(5000),
            sb.from('actual_purchases')
              .select('brand_name, model_name, year, mileage, estimated_low, estimated_high, actual_buy_price, purchased_at')
              .eq('final_status', 'purchased')
              .order('purchased_at', { ascending: false })
              .limit(2000),
            sb.from('pricing_rules').select('id, active, updated_at, source_updated_at'),
            sb.from('buyback_settings').select('stale_days').eq('id', 1).maybeSingle(),
          ]);

        const recentRows = recent.data || [];
        const priced = recentRows.filter((r) => r.estimated_center);
        const staleDays = (settings.data && settings.data.stale_days) || DEFAULT_SETTINGS.stale_days;
        const staleCutoff = Date.now() - staleDays * 864e5;
        const stale = (rules.data || []).filter(
          (r) => r.active && new Date(r.source_updated_at || r.updated_at).getTime() < staleCutoff
        ).length;

        const compared = (purchases.data || [])
          .filter((p) => p.actual_buy_price && p.estimated_low && p.estimated_high)
          .map((p) => {
            const mid = (p.estimated_low + p.estimated_high) / 2;
            return {
              ...p,
              mid,
              err: (p.actual_buy_price - mid) / mid,
              inRange: p.actual_buy_price >= p.estimated_low && p.actual_buy_price <= p.estimated_high,
            };
          });

        setData({
          estToday, leadsToday, clicksToday, estMonth, leadsMonth, buyMonth,
          conversion: leadsMonth ? buyMonth / leadsMonth : NaN,
          topBrands: topCounts(recentRows, (r) => r.brand_name),
          topModels: topCounts(recentRows, (r) => r.brand_name && `${r.brand_name} ${r.model_name}`),
          avgCenter: priced.length ? priced.reduce((s, r) => s + r.estimated_center, 0) / priced.length : null,
          noDataRate: recentRows.length ? recentRows.filter((r) => r.match_quality === 'none').length / recentRows.length : NaN,
          stale,
          staleDays,
          compared,
        });
      } catch (e) {
        setError('讀取失敗：' + (e.message || e));
      }
    })();
  }, []);

  if (error) return <p className="admin-error">{error}</p>;
  if (!data) return <p className="admin-muted">載入中…</p>;

  const keyFns = {
    brand: (p) => p.brand_name || '未填',
    model: (p) => `${p.brand_name} ${p.model_name}`,
    year: (p) => String(p.year || '未填'),
    mileage: (p) => kmBucket(p.mileage || 0),
  };
  const groups = errorGroups(data.compared, keyFns[groupBy]);
  const overall = errorGroups(data.compared, () => 'all')[0];

  return (
    <>
      <h1>收車總覽</h1>

      {data.stale > 0 && (
        <p className="notice">有 {data.stale} 筆行情規則超過 {data.staleDays} 天沒有更新，建議到「行情規則」檢查。</p>
      )}

      <div className="kpis">
        <div className="kpi"><span>今日估價</span><strong>{data.estToday}</strong></div>
        <div className="kpi"><span>今日收車線索</span><strong>{data.leadsToday}</strong></div>
        <div className="kpi"><span>今日 LINE 點擊</span><strong>{data.clicksToday}</strong></div>
        <div className="kpi"><span>本月估價</span><strong>{data.estMonth}</strong></div>
        <div className="kpi"><span>本月收車</span><strong>{data.buyMonth}</strong></div>
        <div className="kpi"><span>本月成交率</span><strong>{pct(data.conversion)}</strong></div>
      </div>
      <p className="admin-muted" style={{ marginTop: 8 }}>成交率＝本月收車數 ÷ 本月新線索數</p>

      <div className="admin-card">
        <h3>近 30 天熱門品牌</h3>
        <ul className="rank">
          {data.topBrands.length ? data.topBrands.map(([k, n]) => <li key={k}><span>{k}</span><span>{n} 次</span></li>) : <li>尚無資料</li>}
        </ul>
      </div>

      <div className="admin-card">
        <h3>近 30 天熱門車型</h3>
        <ul className="rank">
          {data.topModels.length ? data.topModels.map(([k, n]) => <li key={k}><span>{k}</span><span>{n} 次</span></li>) : <li>尚無資料</li>}
        </ul>
        <p className="admin-muted">平均預估行情（中間值）：{nt(data.avgCenter)}　無行情資料比例：{pct(data.noDataRate)}</p>
      </div>

      <div className="admin-card">
        <h3>網站預估 vs 實際收購</h3>
        {overall ? (
          <p className="admin-muted">
            共 {overall.n} 台｜平均誤差 {pct(overall.abs)}｜實際落在預估區間 {pct(overall.inRange)}｜
            {overall.signed >= 0 ? `實收平均比預估中間值高 ${pct(overall.signed)}` : `實收平均比預估中間值低 ${pct(-overall.signed)}`}
          </p>
        ) : (
          <p className="admin-muted">還沒有實際收車紀錄。到「收車線索」記錄實際收購價格後，這裡就會開始統計。</p>
        )}

        {overall && (
          <>
            <div className="tabs">
              {[['brand', '依品牌'], ['model', '依車型'], ['year', '依年份'], ['mileage', '依里程']].map(([k, l]) => (
                <button key={k} aria-pressed={groupBy === k} onClick={() => setGroupBy(k)}>{l}</button>
              ))}
            </div>
            <div className="table-wrap">
              <table className="mini-table">
                <thead><tr><th>分組</th><th>台數</th><th>平均誤差</th><th>偏差</th><th>落在區間</th></tr></thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key}>
                      <td>{g.key}</td><td>{g.n}</td><td>{pct(g.abs)}</td>
                      <td>{g.signed >= 0 ? '+' : ''}{pct(g.signed)}</td><td>{pct(g.inRange)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: 20 }}>最近成交</h3>
            <div className="table-wrap">
              <table className="mini-table">
                <thead><tr><th>車輛</th><th>網站預估</th><th>實際收購</th><th>差異</th></tr></thead>
                <tbody>
                  {data.compared.slice(0, 20).map((p, i) => (
                    <tr key={i}>
                      <td>{p.year} {p.brand_name} {p.model_name}</td>
                      <td>{Math.round(p.estimated_low / 1000)}–{Math.round(p.estimated_high / 1000)}K</td>
                      <td>{Math.round(p.actual_buy_price / 1000)}K</td>
                      <td>{p.err >= 0 ? '+' : ''}{pct(p.err)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-muted">誤差以預估區間的中間值計算。偏差為正代表實際收購比網站預估高，網站可能估太低。</p>
          </>
        )}
      </div>
    </>
  );
          }
