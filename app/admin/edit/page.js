'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import { getSupabase, photoUrl, BUCKET } from '../../../lib/supabase';
import { parseTitle, makeSlug } from '../../../lib/parseTitle';
import { compressImage } from '../../../lib/image';
import { hasCJK } from '../../../lib/i18n';

const EMPTY = {
  title: '', title_en: '', brand: '', model: '', year: '', color: '',
  price: '', price_max: '', mileage: '', description: '', status: 'published', source_owner_id: '',
};

const UNSURE_HINT = '無法從車名判斷，請確認後填寫，不確定可以留空';

export default function EditPage() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="admin-muted">載入中…</p>}>
        <Editor />
      </Suspense>
    </AdminShell>
  );
}

function Field({ label, warn, children }) {
  return (
    <label className={`field${warn ? ' field-unsure' : ''}`}>
      <span>{label}</span>
      {children}
      {warn && <p className="field-hint">{warn}</p>}
    </label>
  );
}

function Editor() {
  const router = useRouter();
  const id = useSearchParams().get('id');
  const carIdRef = useRef(id);
  const uploadedRef = useRef({});

  const [form, setForm] = useState(EMPTY);
  const [partners, setPartners] = useState([]);
  const [unsure, setUnsure] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSupabase()
      .from('partners')
      .select('id, name, active')
      .order('name')
      .then(({ data }) => setPartners(data || []));
  }, []);

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
        setError('找不到這台車。');
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
      });
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

  async function save() {
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
      status: form.status,
      source_owner_id: form.source_owner_id || null,
      ai_unsure: unsure,
      updated_at: new Date().toISOString(),
    };

    try {
      let carId = carIdRef.current;
      setProgress('儲存資料…');
      if (carId) {
        const { error } = await supabase.from('cars').update(row).eq('id', carId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('cars')
          .insert({ ...row, slug: makeSlug(row.title_en || title) })
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

      router.push('/admin');
    } catch (e) {
      setError('儲存失敗：' + (e.message || e) + '。可以再按一次儲存重試。');
      setSaving(false);
      setProgress('');
    }
  }

  if (loading) return <p className="admin-muted">載入中…</p>;

  const needsEnglish = hasCJK(form.title) && !String(form.title_en).trim();

  return (
    <>
      <h1>{id ? '編輯車輛' : '新增車輛'}</h1>

      <h2 className="admin-sub">照片</h2>
      <p className="admin-muted">第一張是封面，可以一次選多張。</p>
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

      <Field label="車源負責人">
        <select value={form.source_owner_id} onChange={(e) => update('source_owner_id', e.target.value)}>
          <option value="">VANTA 自有／未指定</option>
          {partners
            .filter((p) => p.active || p.id === form.source_owner_id)
            .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

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

      <Field label="簡短介紹（選填，只顯示在中文版）">
        <textarea value={form.description} onChange={(e) => update('description', e.target.value)} />
      </Field>

      <Field label="狀態">
        <select value={form.status} onChange={(e) => update('status', e.target.value)}>
          <option value="published">上架</option>
          <option value="draft">草稿</option>
          <option value="unlisted">下架</option>
        </select>
      </Field>

      {error && <p className="admin-error">{error}</p>}

      <div className="save-bar">
        <div className="save-bar-inner">
          <button type="button" className="btn btn-light" onClick={() => router.push('/admin')} disabled={saving}>取消</button>
          <button type="button" className="btn btn-dark" onClick={save} disabled={saving}>
            {saving ? progress || '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </>
  );
}
