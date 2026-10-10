'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CarCard from './CarCard';
import { searchCars, carFilters } from '../lib/cars';
import { site } from '../lib/site';
import { dict } from '../lib/i18n';
import '../styles/find.css';

const EXTRA = {
  zh: {
    all: '全部',
    sortLabel: '排序',
    sorts: [['new', '最新上架'], ['year_desc', '年份：新到舊'], ['year_asc', '年份：舊到新'], ['km_asc', '里程：少到多']],
    kmLabel: '里程',
    kms: [['', '不限里程'], ['30000', '3 萬公里內'], ['50000', '5 萬公里內'], ['100000', '10 萬公里內'], ['150000', '15 萬公里內']],
    total: (n) => `共 ${n} 台`,
    tags: [['', '全部車輛'], ['new', '新到車'], ['lowkm', '低里程']],
    clear: '清除篩選',
  },
  en: {
    all: 'All',
    sortLabel: 'Sort',
    sorts: [['new', 'Newest listings'], ['year_desc', 'Year: newest first'], ['year_asc', 'Year: oldest first'], ['km_asc', 'Mileage: lowest first']],
    kmLabel: 'Mileage',
    kms: [['', 'Any mileage'], ['30000', 'Under 30,000 km'], ['50000', 'Under 50,000 km'], ['100000', 'Under 100,000 km'], ['150000', 'Under 150,000 km']],
    total: (n) => `${n} vehicles`,
    tags: [['', 'All vehicles'], ['new', 'New Arrivals'], ['lowkm', 'Low Mileage']],
    clear: 'Clear filters',
  },
};

export default function CarSearch({ initial, brands, years, lang = 'zh' }) {
  const t = dict[lang].vehicles;
  const X = EXTRA[lang] || EXTRA.zh;
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [year, setYear] = useState('');
  const [sort, setSort] = useState('new');
  const [km, setKm] = useState('');
  const [tag, setTag] = useState('');
  const [cars, setCars] = useState(initial.cars);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [total, setTotal] = useState(initial.total ?? null);
  const [counts, setCounts] = useState({ brands: {}, total: null });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);
  const requestId = useRef(0);
  const [quotes, setQuotes] = useState({});
  const asked = useRef(new Set());

  // 品牌分類的台數
  useEffect(() => {
    carFilters()
      .then((f) => {
        setCounts({ brands: f.brandCounts || {}, total: f.total });
        if (total === null) setTotal(f.total);
      })
      .catch(() => {});
  }, []);

  // 沒有填價格的車：向伺服器要大概的市場行情
  useEffect(() => {
    const ids = cars.filter((c) => !c.price && !c.price_max && c.year && !asked.current.has(c.id)).map((c) => c.id);
    if (!ids.length) return;
    ids.forEach((id) => asked.current.add(id));
    fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((r) => r.json())
      .then((d) => setQuotes((prev) => ({ ...prev, ...(d.quotes || {}) })))
      .catch(() => {});
  }, [cars]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchCars({ q, brand, year, sort, km, tag, page: 0 });
        if (id === requestId.current) {
          setCars(res.cars);
          setHasMore(res.hasMore);
          setTotal(res.total);
          setPage(0);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, brand, year, sort, km, tag]);

  async function loadMore() {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await searchCars({ q, brand, year, sort, km, tag, page: page + 1 });
      if (id === requestId.current) {
        setCars((prev) => [...prev, ...res.cars]);
        setHasMore(res.hasMore);
        setPage(page + 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const filtered = q || brand || year || km || tag || sort !== 'new';
  function clearAll() {
    setQ('');
    setTag('');
    setBrand('');
    setYear('');
    setKm('');
    setSort('new');
  }

  return (
    <>
      {/* 品牌分類：可左右滑動 */}
      <div className="brand-chips" role="tablist" aria-label={t.brandLabel}>
        <button aria-pressed={!brand} onClick={() => setBrand('')}>
          {X.all}{counts.total ? <small>{counts.total}</small> : null}
        </button>
        {brands.map((b) => (
          <button key={b} aria-pressed={brand === b} onClick={() => setBrand(brand === b ? '' : b)}>
            {b}{counts.brands[b] ? <small>{counts.brands[b]}</small> : null}
          </button>
        ))}
      </div>

      <div className="tag-chips">
        {X.tags.map(([v, l]) => (
          <button key={v || 'all'} aria-pressed={tag === v} onClick={() => setTag(v)}>{l}</button>
        ))}
      </div>

      <div className="search search-grid">
        <input
          type="search"
          placeholder={t.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.searchLabel}
        />
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={t.yearLabel}>
          <option value="">{t.allYears}</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <select value={km} onChange={(e) => setKm(e.target.value)} aria-label={X.kmLabel}>
          {X.kms.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={X.sortLabel}>
          {X.sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="search-meta">
        <span>{total !== null ? X.total(total) : ''}</span>
        {filtered && <button className="text-link" onClick={clearAll}>{X.clear}</button>}
      </div>

      {cars.length > 0 && (
        <div className="grid">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} lang={lang} market={quotes[car.id] && quotes[car.id].market} />
          ))}
        </div>
      )}

      {!loading && cars.length === 0 && (
        <>
          <p className="empty">
            {t.emptyBefore}
            <a href={site.lineUrl} target="_blank" rel="noopener noreferrer">{t.emptyLink}</a>
            {t.emptyAfter}
          </p>
          <div className="more-link" style={{ marginTop: 0 }}>
            <Link href={`/${lang}/find-your-car`} className="btn btn-dark">
              {lang === 'en' ? 'Ask VANTA to Find It' : '請 VANTA 幫我找'}
            </Link>
          </div>
        </>
      )}

      {cars.length > 0 && !hasMore && (
        <p className="empty" style={{ textAlign: 'center' }}>
          {lang === 'en' ? "Can't find the right one? " : '沒有看到想要的？'}
          <Link href={`/${lang}/find-your-car`}>{lang === 'en' ? 'Tell VANTA what you want' : '告訴 VANTA 你想找什麼'}</Link>
        </p>
      )}

      {hasMore && (
        <div className="more-link">
          <button className="btn btn-light" onClick={loadMore} disabled={loading}>
            {loading ? t.loading : t.loadMore}
          </button>
        </div>
      )}
    </>
  );
        }
