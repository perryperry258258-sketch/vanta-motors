'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import '../styles/viewing.css';

const LABEL = {
  title: '車名', year: '年份', mileage: '里程', price: '行情最低', price_max: '行情最高', color: '顏色', description: '介紹',
  accident_info: '事故紀錄', flood_info: '泡水紀錄', repair_info: '維修紀錄', maintenance_info: '保養紀錄',
  status: '狀態', source_owner_id: '車源',
};
const STATUS = { published: '上架', draft: '草稿', unlisted: '下架' };

function show(field, v) {
  if (v === null || v === undefined || v === '') return '（空白）';
  if (field === 'status') return STATUS[v] || v;
  if (field === 'mileage') return `${Number(v).toLocaleString('en-US')} 公里`;
  if (field === 'price' || field === 'price_max') return `${v} 萬`;
  if (field === 'source_owner_id') return '已變更';
  return String(v).length > 60 ? `${String(v).slice(0, 60)}…` : v;
}

// 車輛資料修改紀錄：舊值、新值、修改人、時間（資料庫自動記錄，無法修改）
export default function VehicleHistory({ carId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    getSupabase()
      .from('vehicle_info_history')
      .select('*')
      .eq('car_id', carId)
      .order('changed_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows(data || []));
  }, [carId]);

  if (!rows || !rows.length) return null;
  return (
    <details className="viewing-history" style={{ marginTop: 20 }}>
      <summary>車輛資料修改紀錄（{rows.length}）</summary>
      <ul className="rank">
        {rows.map((r) => (
          <li key={r.id} style={{ display: 'block' }}>
            <span>{LABEL[r.field] || r.field}：{show(r.field, r.old_value)} → {show(r.field, r.new_value)}</span>
            <br />
            <span className="admin-muted">{r.changed_by_label || '系統'}｜{new Date(r.changed_at).toLocaleString('zh-TW', { hour12: false })}</span>
          </li>
        ))}
      </ul>
    </details>
  );
  }
