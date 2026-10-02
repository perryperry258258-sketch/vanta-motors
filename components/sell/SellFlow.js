'use client';

import { useMemo, useState } from 'react';
import { dict } from '../../lib/i18n';
import { site } from '../../lib/site';
import { getSupabase } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { buildLineMessage, lineChatUrl, formatNT, formatKm, formatDate } from '../../lib/buyback/format';
import EstimateBreakdown from '../EstimateBreakdown';

const postJSON = (url, data, extra = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), ...extra });

export default function SellFlow({ lang, brands, minYear, maxYear }) {
  const t = dict[lang].sell;
  const [brandId, setBrandId] = useState('');
  const [modelId, setModelId] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [leadId, setLeadId] = useState(null);
  const [photos, setPhotos] = useState({});
  const [contact, setContact] = useState({ name: '', phone: '', lineId: '' });
  const [copied, setCopied] = useState(false);
  const [clicked, setClicked] = useState(false);

  const brand = brands.find((b) => b.id === brandId);
  const years = useMemo(() => {
    const list = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  if (!brands.length) {
    return (
      <div className="estimate-box">
        <p className="estimate-nodata">{t.unavailable}</p>
        <div className="estimate-cta">
          <a className="btn btn-dark" href={site.lineUrl} target="_blank" rel="noopener noreferrer">{t.lineCtaNoData}</a>
        </div>
        <p className="estimate-updated">LINE ID：{site.lineId}</p>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!brandId || !modelId || !year || mileage === '') return setError(t.missing);
    setBusy(true);
    try {
      const res = await postJSON('/api/buyback/estimate', { modelId, year: Number(year), mileage: Number(mileage), lang });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      setResult(data);
      setLeadId(crypto.randomUUID());
      setPhotos({});
      setCopied(false);
      setClicked(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setResult(null);
    setPhotos({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function addPhoto(slot, file) {
    if (!file || !result) return;
    const url = URL.createObjectURL(file);
    setPhotos((p) => ({ ...p, [slot]: { url, uploading: true } }));
    try {
      const blob = await compressImage(file, 1600, 0.8);
      const res = await postJSON('/api/buyback/upload', { estimateId: result.id, leadId });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const { error: upErr } = await getSupabase()
        .storage.from('buyback-photos')
        .uploadToSignedUrl(data.path, data.token, blob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      setPhotos((p) => ({ ...p, [slot]: { url, path: data.path } }));
    } catch {
      setPhotos((p) => ({ ...p, [slot]: { url, failed: true } }));
    }
  }

  function removePhoto(slot) {
    setPhotos((p) => {
      const next = { ...p };
      delete next[slot];
      return next;
    });
  }

  const photoPaths = Object.values(photos).filter((p) => p.path).map((p) => p.path);
  const uploading = Object.values(photos).some((p) => p.uploading);
  const message = result ? buildLineMessage(lang, result, photoPaths.length) : '';
  const lineHref = lineChatUrl(message);

  function copyMessage() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message).then(() => setCopied(true)).catch(() => {});
    }
  }

  function onLine() {
    setClicked(true);
    if (!site.lineOaId) copyMessage();
    postJSON(
      '/api/buyback/lead',
      { leadId, estimateId: result.id, name: contact.name, phone: contact.phone, lineId: contact.lineId, photoPaths },
      { keepalive: true }
    ).catch(() => {});
  }

  if (result) {
    const hasRange = result.quality !== 'none' && result.low && result.high;
    return (
      <div className="estimate">
        <p className="estimate-car-label">{t.yourCar}</p>
        <h2 className="estimate-car">{`${result.year} ${result.brand} ${result.model}`}</h2>
        <p className="estimate-km">{formatKm(result.mileage)}</p>

        <div className="estimate-box">
          {hasRange ? (
            <>
              <p className="estimate-range-label">{t.range}</p>
              <p className="estimate-range">NT${formatNT(result.low)} – {formatNT(result.high)}</p>
              {result.quality === 'nearest' && <p className="estimate-limited">{t.limited}</p>}
              <p className="estimate-note">{t.disclaimer}</p>
              {result.updatedAt && (
                <p className="estimate-updated">{t.updated}{formatDate(lang, result.updatedAt)}</p>
              )}
              <EstimateBreakdown
                lang={lang}
                b={result.breakdown}
                extra={
                  result.spreadLow
                    ? lang === 'en'
                      ? `Buyback range = estimated market value × ${Math.round(result.spreadLow * 100)}%–${Math.round(result.spreadHigh * 100)}%`
                      : `預估收購行情 ＝ 預估市場行情 × ${Math.round(result.spreadLow * 100)}%～${Math.round(result.spreadHigh * 100)}%`
                    : null
                }
              />
            </>
          ) : (
            <p className="estimate-nodata">{t.noData}</p>
          )}

          <div className="estimate-cta">
            <a className="btn btn-dark" href={lineHref} target="_blank" rel="noopener noreferrer" onClick={onLine}>
              {hasRange ? t.lineCta : t.lineCtaNoData}
            </a>
          </div>

          {!site.lineOaId && (
            <div className="line-fallback">
              {clicked && <p>{t.fallback}</p>}
              {clicked && <pre>{message}</pre>}
              <div className="line-fallback-row">
                <span>LINE ID：{site.lineId}</span>
                <button type="button" className="text-link" onClick={copyMessage}>
                  {copied ? t.copied : t.copy}
                </button>
              </div>
            </div>
          )}
        </div>

        <section className="photos">
          <h3>{t.photosTitle}</h3>
          <p className="photos-lead">{t.photosLead}</p>
          <p className="estimate-note">{t.photosNote}</p>
          <div className="photo-slots">
            {t.slots.map((label, i) => {
              const p = photos[i];
              return (
                <label key={label} className={`photo-slot${p ? ' filled' : ''}`}>
                  {p && <img src={p.url} alt="" />}
                  <span className="photo-slot-label">
                    {p && p.uploading ? t.uploading : p && p.failed ? t.uploadFailed : label}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      addPhoto(i, e.target.files && e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                  {p && !p.uploading && (
                    <button
                      type="button"
                      className="photo-slot-remove"
                      aria-label={t.remove}
                      onClick={(e) => {
                        e.preventDefault();
                        removePhoto(i);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </label>
              );
            })}
          </div>

          <p className="sell-contact-label">{t.contactOptional}</p>
          <div className="sell-contact">
            <input placeholder={t.name} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <input placeholder={t.phone} inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            <input placeholder={t.lineId} value={contact.lineId} onChange={(e) => setContact({ ...contact, lineId: e.target.value })} />
          </div>

          <div className="estimate-cta">
            <a
              className={`btn btn-light${uploading ? ' is-disabled' : ''}`}
              href={lineHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={uploading}
              onClick={(e) => {
                if (uploading) {
                  e.preventDefault();
                  return;
                }
                onLine();
              }}
            >
              {uploading ? t.uploading : t.sendLine}
            </a>
          </div>
        </section>

        <div className="restart">
          <button type="button" className="text-link" onClick={restart}>{t.restart}</button>
        </div>
      </div>
    );
  }

  return (
    <form className="sell-form" onSubmit={submit}>
      <label className="sell-step">
        <span className="sell-step-label"><small>Step 1</small>{t.brand}</span>
        <select
          value={brandId}
          onChange={(e) => {
            setBrandId(e.target.value);
            setModelId('');
          }}
        >
          <option value="">{t.selectBrand}</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>

      <label className="sell-step">
        <span className="sell-step-label"><small>Step 2</small>{t.model}</span>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!brand}>
          <option value="">{brand ? t.selectModel : t.selectBrandFirst}</option>
          {brand && brand.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

      <label className="sell-step">
        <span className="sell-step-label"><small>Step 3</small>{t.year}</span>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">{t.selectYear}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>

      <div className="sell-step">
        <label className="sell-step-label" htmlFor="sell-km"><small>Step 4</small>{t.mileage}</label>
        <div className="sell-km">
          <input
            id="sell-km"
            inputMode="numeric"
            placeholder={t.mileagePlaceholder}
            value={mileage === '' ? '' : Number(mileage).toLocaleString('en-US')}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
              setMileage(digits === '' ? '' : String(Number(digits)));
            }}
          />
          <span>km</span>
        </div>
        <div className="sell-chips">
          {t.quick.map(([label, value]) => (
            <button
              key={label}
              type="button"
              aria-pressed={Number(mileage) === value}
              onClick={() => setMileage(String(value))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="sell-error">{error}</p>}

      <button className="btn btn-dark sell-submit" disabled={busy}>
        {busy ? t.calculating : t.submit}
      </button>

      <p className="sell-help">
        <a href={site.lineUrl} target="_blank" rel="noopener noreferrer" className="text-link">{t.notListed}</a>
      </p>
    </form>
  );
          }
