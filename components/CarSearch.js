'use client';

import { useMemo, useState } from 'react';
import CarCard from './CarCard';
import { site } from '../lib/site';

export default function CarSearch({ cars }) {
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [year, setYear] = useState('');

  const brands = useMemo(
    () => [...new Set(cars.map((c) => c.brand).filter(Boolean))].sort(),
    [cars]
  );
  const years = useMemo(
    () => [...new Set(cars.map((c) => c.year).filter(Boolean))].sort((a, b) => b - a),
    [cars]
  );

  const keyword = q.trim().toLowerCase();
  const list = cars.filter(
    (c) =>
      (!brand || c.brand === brand) &&
      (!year || String(c.year) === year) &&
      (!keyword || c.title.toLowerCase().includes(keyword))
  );

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

      {list.length > 0 ? (
        <div className="grid">
          {list.map((car) => <CarCard key={car.slug} car={car} />)}
        </div>
      ) : (
        <p className="empty">
          目前沒有符合條件的車輛。可以清除篩選，或直接
          <a href={`tel:${site.phone}`}>來電詢問</a>
          想找的車款。
        </p>
      )}
    </>
  );
}
