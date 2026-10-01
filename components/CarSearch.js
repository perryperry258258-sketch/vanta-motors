'use client';

import { useEffect, useRef, useState } from 'react';
import CarCard from './CarCard';
import { searchCars } from '../lib/cars';
import { site } from '../lib/site';

export default function CarSearch({ initial, brands, years }) {
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
          placeholder="搜尋車型，例如 320i"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="搜尋車型"
        />
        <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="品牌">
          <option value="">所有品牌</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="年份">
          <option value="">所有年份</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      {cars.length > 0 && (
        <div className="grid">
          {cars.map((car) => <CarCard key={car.id} car={car} />)}
        </div>
      )}

      {!loading && cars.length === 0 && (
        <p className="empty">
          目前沒有符合條件的車輛。可以清除篩選，或直接
          <a href={`tel:${site.phone}`}>來電詢問</a>
          想找的車款。
        </p>
      )}

      {hasMore && (
        <div className="more-link">
          <button className="btn btn-light" onClick={loadMore} disabled={loading}>
            {loading ? '載入中…' : '載入更多'}
          </button>
        </div>
      )}
    </>
  );
}
