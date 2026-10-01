'use client';

import { useEffect, useRef, useState } from 'react';
import CarCard from './CarCard';
import { searchCars } from '../lib/cars';
import { site } from '../lib/site';
import { dict } from '../lib/i18n';

export default function CarSearch({ initial, brands, years, lang = 'zh' }) {
  const t = dict[lang].vehicles;
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [year, setYear] = useState('');
  const [cars, setCars] = useState(initial.cars);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchCars({ q, brand, year, page: 0 });
        if (id === requestId.current) {
          setCars(res.cars);
          setHasMore(res.hasMore);
          setPage(0);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, brand, year]);

  async function loadMore() {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await searchCars({ q, brand, year, page: page + 1 });
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

  return (
    <>
      <div className="search">
        <input
          type="search"
          placeholder={t.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.searchLabel}
        />
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={t.brandLabel}>
          <option value="">{t.allBrands}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={t.yearLabel}>
          <option value="">{t.allYears}</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      {cars.length > 0 && (
        <div className="grid">
          {cars.map((car) => <CarCard key={car.id} car={car} lang={lang} />)}
        </div>
      )}

      {!loading && cars.length === 0 && (
        <p className="empty">
          {t.emptyBefore}
          <a href={`tel:${site.phone}`}>{t.emptyLink}</a>
          {t.emptyAfter}
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
