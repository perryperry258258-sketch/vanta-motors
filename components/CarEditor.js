'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase, photoUrl, BUCKET } from '../lib/supabase';
import { parseTitle, makeSlug } from '../lib/parseTitle';
import { compressImage } from '../lib/image';
import { hasCJK } from '../lib/i18n';
import VehicleHistory from './VehicleHistory';

const EMPTY = {
  title: '', title_en: '', brand: '', model: '', year: '', color: '',
  price: '', price_max: '', mileage: '', description: '', status: 'published', source_owner_id: '',
  accident_info: '', flood_info: '', repair_info: '', maintenance_info: '',
};

// 車況資料（內部紀錄，不顯示在網站）：每次修改都會保留舊值、新值、修改人與時間
const CONDITION_FIELDS = [
  ['accident_info', '事故紀錄', '例如：無重大事故／右前葉子板鈑金'],
  ['flood_info', '泡水紀錄', '例如：無泡水紀錄'],
  ['repair_info', '維修紀錄', '例如：2025/6 更換變速箱油'],
  ['maintenance_info', '保養紀錄', '例如：原廠定保至 6 萬公里'],
];

const UNSURE_HINT = '無法從車名判斷，請確認後填寫，不確定可以留空';

function Field({ label, warn, children }) {
  return (
    <label className={`field${warn ? ' field-unsure' : ''}`}>
      <span>{label}</span>
      {children}
      {warn && <p className="field-hint">{warn}</p>}
    </label>
  );
}

// 車輛編輯器：管理員與合作車源共用
// mode = 'admin'：可直接上架、指定車源
// mode = 'partner'：車輛固定綁定自己，新車要送 VANTA 審核才會上架
export default function CarEditor({ id, mode = 'admin', partnerId = null, backHref = '/admin' }) {
  const router = useRouter();
  const isPartner = mode === 'partner';
  const carIdRef = useRef(id);
  const uploadedRef = useRef({});

  const [form, setForm] = useState({ ...EMPTY, status: isPartner ? 'draft' : 'published' });
  const [review, setReview] = useState({ status: null, note: null });
  const [partners, setPartners] = useState([]);
  const [unsure, setUnsure] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [infoMeta, setInfoMeta] = useState({ at: null, by: null });

  useEffect(() => {
    if (isPartner) return;
    getSupabase()
      .from('partners')
      .select('id, name, active')
      .order('name')
      .then(({ data }) => setPartners(data || []));
  }, [isPartner]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await getSupabase()
        .from('cars')
        .select('*, car_photos(id, path, sort_order)')
        .eq('id', id)
        .order('sort_order', { referencedTable: 'car_photos' })
        .maybeSingle();
      if (error || !data) {
        setError('找不到這台車，或你沒有權限編輯。');
        setLoading(false);
        return;
      }
      setForm({
        title: data.title || '',
        title_en: data.title_en || '',
        brand: data.brand || '',
        model: data.model || '',
        year: data.year ?? '',
        color: data.color || '',
        price: data.price ?? '',
        price_max: data.price_max ?? '',
        mileage: data.mileage ?? '',
        description: data.description || '',
        status: data.status,
        source_owner_id: data.source_owner_id || '',
        accident_info: data.accident_info || '',
        flood_info: data.flood_info || '',
        repair_info: data.repair_info || '',
        maintenance_info: data.maintenance_info || '',
      });
      setInfoMeta({ at: data.info_updated_at, by: data.info_updated_by });
      setReview({ status: data.review_status, note: data.review_note });
      setUnsure(data.ai_unsure || []);
      setPhotos((data.car_photos || []).map((p) => ({ key: p.id, id: p.id, path: p.path, url: photoUrl(p.path) })));
      setLoading(false);
    })();
  }, [id]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setUnsure((u) => u.filter((x) => x !== field));
  }

  function autofill() {
    const p = parseTitle(form.title);
    setForm((f) => ({ ...f, title: p.title, brand: p.brand || '', model: p.model || '', year: p.year || '' }));
    setUnsure(p.unsure);
  }

  function onTitleBlur() {
    if (form.title.trim() && !form.brand && !form.model && !form.year) autofill();
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name)
    );
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setPhotos((prev) => [
      ...prev,
      ...files.map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ]);
  }

  function move(i, d) {
    setPhotos((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const a = [...prev];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }

  function makeCover(i) {
    setPhotos((prev) => {
      const a = [...prev];
      const [p] = a.splice(i, 1);
      return [p, ...a];
    });
  }

  function removePhoto(i) {
    const p = photos[i];
    if (p.id) setRemoved((r) => [...r, p]);
    setPhotos((prev) => prev.filter((x) => x.key !== p.key));
  }

  // submitForReview：合作車源按「送出審核」
  async function save(submitForReview = false) {
    setError('');
    const title = form.title.replace(/\s+/g, ' ').trim();
    if (!title) return setError('請輸入車名，例如 2021 BMW 320i。');
    if (photos.length === 0) return setError('請至少上傳一張照片。');

    const num = (v) => (v === '' || v === null || v === undefined ? null : Math.round(Number(v)));
    let price = num(form.price);
    let priceMax = num(form.price_max);
    if (price === null && priceMax !== null) {
      price = priceMax;
      priceMax = null;
    }
    if (price !== null && priceMax !== null) {
      if (priceMax < price) [price, priceMax] = [priceMax, price];
      if (priceMax === price) priceMax = null;
    }

    setSaving(true);
    const supabase = getSupabase();
    const row = {
      title,
      title_en: String(form.title_en).replace(/\s+/g, ' ').trim() || null,
      brand: String(form.brand).trim() || null,
      model: String(form.model).trim() || null,
      year: num(form.year),
      color: String(form.color).trim() || null,
      price,
      price_max: priceMax,
      mileage: num(form.mileage),
      description: String(form.description).trim() || null,
      accident_info: String(form.accident_info).trim() || null,
      flood_info: String(form.flood_info).trim() || null,
      repair_info: String(form.repair_info).trim() || null,
      maintenance_info: String(form.maintenance_info).trim() || null,
      ai_unsure: unsure,
      updated_at: new Date().toISOString(),
    };
    if (isPartner) {
      row.source_owner_id = partnerId;
      if (submitForReview) {
        row.review_status = 'pending';
        row.review_note = null;
      }
      if (form.status !== 'published') row.status = 'draft';
    } else {
      row.status = form.status;
      row.source_owner_id = form.source_owner_id || null;
      if (form.status === 'published') {
        row.review_status = null;
        row.review_note = null;
      }
    }

    try {
      let carId = carIdRef.current;
      setProgress('儲存資料…');
      if (carId) {
        const { error } = await supabase.from('cars').update(row).eq('id', carId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('cars')
          .insert({ ...row, status: row.status || 'draft', slug: makeSlug(row.title_en || title) })
          .select('id')
          .single();
        if (error) throw error;
        carId = data.id;
        carIdRef.current = carId;
      }

      const newOnes = photos.filter((p) => !p.id);
      for (let i = 0; i < newOnes.length; i++) {
        const p = newOnes[i];
        if (uploadedRef.current[p.key]) continue;
        setProgress(`上傳照片 ${i + 1} / ${newOnes.length}`);
        const blob = await compressImage(p.file);
        const path = `${carId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        uploadedRef.current[p.key] = path;
      }

      setProgress('整理照片順序…');
      if (removed.length) {
        await supabase.storage.from(BUCKET).remove(removed.map((p) => p.path));
        const { error } = await supabase.from('car_photos').delete().in('id', removed.map((p) => p.id));
        if (error) throw error;
        setRemoved([]);
      }

      const inserts = [];
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (p.id) {
          const { error } = await supabase.from('car_photos').update({ sort_order: i }).eq('id', p.id);
          if (error) throw error;
        } else {
          inserts.push({ car_id: carId, path: uploadedRef.current[p.key], sort_order: i });
        }
      }
      if (inserts.length) {
        const { error } = await supabase.from('car_photos').insert(inserts);
        if (error) throw error;
      }

      router.push(backHref);
    } catch (e) {
      const msg = String(e.message || e);
      setError(msg.includes('審核') ? '上架需要 VANTA 審核，請按「送出審核」。' : `儲存失敗：${msg}。可以再按一次儲存重試。`);
      setSaving(false);
      setProgress('');
    }
  }

  if (loading) return <p className="admin-muted">載入中…</p>;
  if (error && !form.title && id) return <p className="admin-error">{error}</p>;

  const needsEnglish = hasCJK(form.title) && !String(form.title_en).trim();
  const isLive = form.status === 'published';

  return (
    <>
      <h1>{id ? '編輯車輛' : '新增車輛'}</h1>

      {isPartner && review.status === 'pending' && <p className="notice">已送出，VANTA 審核後就會上架。</p>}
      {isPartner && review.status === 'rejected' && (
        <p className="notice">VANTA 退回這台車{review.note ? `：${review.note}` : ''}。修改後可以再送出審核。</p>
      )}
      {isPartner && isLive && <p className="admin-muted">這台車已經上架，儲存後網站會直接更新。</p>}

      <h2 className="admin-sub">照片</h2>
      <p className="admin-muted">第一張是封面，可以一次選多張。請盡量不要拍到車牌。</p>
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <div className="photo-item" key={p.key}>
              <img src={p.url} alt={`照片 ${i + 1}`} />
              <span className="photo-badge">{i === 0 ? '封面' : i + 1}</span>
              <div className="photo-tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || saving} aria-label="往前">←</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1 || saving} aria-label="往後">→</button>
                <button type="button" onClick={() => makeCover(i)} disabled={i === 0 || saving}>封面</button>
                <button type="button" onClick={() => removePhoto(i)} disabled={saving} aria-label="移除">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="photo-add">
        ＋ 選擇照片
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={saving}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      <h2 className="admin-sub">車輛資料</h2>
      <Field label="車名">
        <input
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          onBlur={onTitleBlur}
          placeholder="例如 2021 BMW 320i"
        />
      </Field>
      <button type="button" className="text-btn" onClick={autofill}>從車名自動帶入品牌、車型、年份</button>

      <Field
        label="English Title（選填）"
        warn={needsEnglish && '車名含中文，建議填寫英文車名，英文版網站才會顯示得自然'}
      >
        <input
          value={form.title_en}
          onChange={(e) => update('title_en', e.target.value)}
          placeholder="車名已是英文就不用填"
        />
      </Field>

      {!isPartner && (
        <Field label="車源負責人">
          <select value={form.source_owner_id} onChange={(e) => update('source_owner_id', e.target.value)}>
            <option value="">VANTA 自有／未指定</option>
            {partners
              .filter((p) => p.active || p.id === form.source_owner_id)
              .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}

      <div className="field-grid">
        <Field label="品牌" warn={unsure.includes('brand') && UNSURE_HINT}>
          <input value={form.brand} onChange={(e) => update('brand', e.target.value)} />
        </Field>
        <Field label="車型" warn={unsure.includes('model') && UNSURE_HINT}>
          <input value={form.model} onChange={(e) => update('model', e.target.value)} />
        </Field>
        <Field label="年份" warn={unsure.includes('year') && UNSURE_HINT}>
          <input type="number" inputMode="numeric" value={form.year} onChange={(e) => update('year', e.target.value)} />
        </Field>
        <Field label="顏色（選填）">
          <input value={form.color} onChange={(e) => update('color', e.target.value)} />
        </Field>
        <Field label="行情最低（萬，選填）">
          <input type="number" inputMode="numeric" value={form.price} onChange={(e) => update('price', e.target.value)} />
        </Field>
        <Field label="行情最高（萬，選填）">
          <input type="number" inputMode="numeric" value={form.price_max} onChange={(e) => update('price_max', e.target.value)} />
        </Field>
        <Field label="里程（公里，選填）">
          <input type="number" inputMode="numeric" value={form.mileage} onChange={(e) => update('mileage', e.target.value)} />
        </Field>
      </div>
      <p className="admin-muted">行情只填一格會顯示單一價格，兩格都空白會顯示「歡迎洽詢」。</p>

      <Field label={isPartner ? '車況與簡短介紹（選填，只顯示在中文版）' : '簡短介紹（選填，只顯示在中文版）'}>
        <textarea
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder={isPartner ? '例如：一手車、原廠保養、無重大事故（請只寫已確認的資訊）' : ''}
        />
      </Field>

      <h2 className="admin-sub">車況資料</h2>
      <p className="admin-muted">
        內部紀錄，不會顯示在網站。{isPartner ? '請只填已確認的資訊，' : '由車源提供，'}每次修改都會保留修改前的內容、修改人與時間。
        {infoMeta.at && <><br />最後更新：{new Date(infoMeta.at).toLocaleString('zh-TW', { hour12: false })}｜{infoMeta.by || '—'}</>}
      </p>
      {CONDITION_FIELDS.map(([k, label, ph]) => (
        <Field key={k} label={label}>
          <input value={form[k]} onChange={(e) => update(k, e.target.value)} placeholder={ph} />
        </Field>
      ))}

      {!isPartner && (
        <Field label="狀態">
          <select value={form.status} onChange={(e) => update('status', e.target.value)}>
            <option value="published">上架</option>
            <option value="draft">草稿</option>
            <option value="unlisted">下架</option>
          </select>
        </Field>
      )}

      {id && <VehicleHistory carId={id} />}

      {error && <p className="admin-error">{error}</p>}

      <div className="save-bar">
        <div className="save-bar-inner">
          <button type="button" className="btn btn-light" onClick={() => router.push(backHref)} disabled={saving}>取消</button>
          {isPartner && !isLive ? (
            <>
              <button type="button" className="btn btn-light" onClick={() => save(false)} disabled={saving}>
                {saving ? progress || '儲存中…' : '存草稿'}
              </button>
              <button type="button" className="btn btn-dark" onClick={() => save(true)} disabled={saving}>
                {saving ? '…' : '送出審核'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-dark" onClick={() => save(false)} disabled={saving}>
              {saving ? progress || '儲存中…' : '儲存'}
            </button>
          )}
        </div>
      </div>
    </>
  );
        }
