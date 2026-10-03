'use client';

import { useEffect, useState } from 'react';

// 版本選單：依品牌＋車型＋年份，從歷史新車價資料庫讀取當年的版本
export default function VersionSelect({ lang = 'zh', brand, model, year, value, onChange, step }) {
  const [versions, setVersions] = useState([]);

  useEffect(() => {
    setVersions([]);
    if (!brand || !model || !year) return;
    let alive = true;
    const qs = new URLSearchParams({ brand, model, year: String(year) });
    fetch(`/api/history/versions?${qs}`)
      .then((r) => r.json())
      .then((d) => alive && setVersions(d.versions || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [brand, model, year]);

  if (!versions.length) return null;
  return (
    <label className="sell-step">
      <span className="sell-step-label">
        {step && <small>{step}</small>}
        {lang === 'en' ? 'Version (optional)' : '版本（選填）'}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{lang === 'en' ? 'Not sure' : '不確定'}</option>
        {versions.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </label>
  );
        }
