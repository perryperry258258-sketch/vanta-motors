'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { site } from '../../lib/site';
import { findDict } from '../../lib/i18n-find';
import { formatDate } from '../../lib/buyback/format';
import {
  MILEAGE_OPTIONS, BUDGET_OPTIONS, FUEL_OPTIONS, BODY_OPTIONS, TIER_LABEL,
  parseBudget, budgetText, buildFindMessage,
} from '../../lib/find';

const nt = (n) => Number(n).toLocaleString('en-US');

export default function FindFlow({ lang, brands, minYear, maxYear }) {
  const t = findDict[lang];
  const L = (opt) => (lang === 'en' ? opt[2] : opt[1]);
  const [brandId, setBrandId] = useState('');
  const [modelId, setModelId] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [budget, setBudget] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [more, setMore] = useState({ fuel: '', bodyType: '', color: '', region: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

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
          <a className="btn btn-dark" href={site.lineUrl} target="_blank" rel="noopener noreferrer">LINE</a>
        </div>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!brandId || !modelId) return setError(t.missing);
    setBusy(true);
    const { min, max } = parseBudget(budget);
    try {
      const res = await fetch('/api/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          year: year ? Number(year) : null,
          mileageMax: mileage ? Number(mileage) : null,
          budgetMin: min,
          budgetMax: max,
          ...more,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      setResult(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const message = buildFindMessage(lang, result);
    const lineHref = site.lineOaId
      ? `https://line.me/R/oaMessage/${encodeURIComponent(site.lineOaId)}/?${encodeURIComponent(message)}`
      : site.lineUrl;
    const kmText = result.mileageMax ? `${nt(result.mileageMax)} ${t.km}` : t.any;

    return (
      <div className="estimate">
        <p className="estimate-car-label">{t.yourRequest}</p>
        <h2 className="estimate-car">{`${result.year ? `${result.year} ` : ''}${result.brand} ${result.model}`}</h2>
        <p className="estimate-km">
          {t.mileageLabel} {kmText}｜{t.budgetLabel} {budgetText(lang, result.budgetMin, result.budgetMax)}
        </p>

        <div className="estimate-box">
          {result.range ? (
            <>
              <p className="estimate-range-label">{t.rangeLabel}</p>
              <p className="estimate-range">NT${nt(result.range.low)} – {nt(result.range.high)}</p>
              <p className="estimate-note">{t.rangeNote}</p>
              <p className="estimate-updated">
                {t.confidence}{t.confidenceLabel[result.confidence] || t.confidenceLabel.low}
                {result.updatedAt ? `｜${t.updated}${formatDate(lang, result.updatedAt)}` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="estimate-nodata">{result.year ? t.noRange : t.pickYear}</p>
              <p className="estimate-note">{t.noRangeNote}</p>
            </>
          )}
          <div className="estimate-cta">
            <a className="btn btn-dark" href={lineHref} target="_blank" rel="noopener noreferrer">{t.cta}</a>
          </div>
          <p className="estimate-updated">{t.ctaNote}</p>
        </div>

        <section className="photos">
          <h3>{result.matches.length ? t.matchesTitle : t.noMatchTitle}</h3>
          <p className="photos-lead">{result.matches.length ? t.matchesLead : t.noMatchLead}</p>
          {result.matches.length > 0 && (
            <div className="find-matches">
              {result.matches.map((m) => (
                <Link key={m.slug} href={`/${lang}/vehicles/${m.slug}`} className="find-match">
                  <div className="find-match-img">{m.cover && <img src={m.cover} alt={m.title} loading="lazy" />}</div>
                  <div>
                    <span className={`find-tier find-tier-${m.tier}`}>{TIER_LABEL[lang][m.tier]}</span>
                    <h4>{m.title}</h4>
                    <span className="text-link">{t.viewCar}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="restart">
          <button type="button" className="text-link" onClick={() => setResult(null)}>{t.restart}</button>
        </div>
      </div>
    );
  }

  const chip = (value, current, set, opt) => (
    <button key={opt[0]} type="button" aria-pressed={current === opt[0]} onClick={() => set(current === opt[0] ? '' : opt[0])}>
      {L(opt)}
    </button>
  );

  return (
    <form className="sell-form" onSubmit={submit}>
      <label className="sell-step">
        <span className="sell-step-label"><small>Step 1</small>{t.brand}</span>
        <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); }}>
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
          <option value="">{t.anyYear}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>

      <div className="sell-step">
        <span className="sell-step-label"><small>Step 4</small>{t.mileage}</span>
        <div className="sell-chips">
          {MILEAGE_OPTIONS.filter((o) => o[0]).map((o) => chip(o[0], mileage, setMileage, o))}
        </div>
      </div>

      <div className="sell-step">
        <span className="sell-step-label"><small>Step 5</small>{t.budget}</span>
        <div className="sell-chips">
          {BUDGET_OPTIONS.filter((o) => o[0]).map((o) => chip(o[0], budget, setBudget, o))}
        </div>
      </div>

      <button type="button" className="text-link" style={{ justifySelf: 'start' }} onClick={() => setShowMore(!showMore)}>
        {showMore ? t.less : t.more}
      </button>

      {showMore && (
        <div className="find-more">
          <div className="sell-step">
            <span className="sell-step-label">{t.fuel}</span>
            <div className="sell-chips">{FUEL_OPTIONS.map((o) => chip(o[0], more.fuel, (v) => setMore({ ...more, fuel: v }), o))}</div>
          </div>
          <div className="sell-step">
            <span className="sell-step-label">{t.body}</span>
            <div className="sell-chips">{BODY_OPTIONS.map((o) => chip(o[0], more.bodyType, (v) => setMore({ ...more, bodyType: v }), o))}</div>
          </div>
          <div className="sell-contact">
            <input placeholder={t.color} value={more.color} onChange={(e) => setMore({ ...more, color: e.target.value })} />
            <input placeholder={t.region} value={more.region} onChange={(e) => setMore({ ...more, region: e.target.value })} />
          </div>
          <div className="sell-contact">
            <input placeholder={`${t.notes}｜${t.notesPlaceholder}`} value={more.notes} onChange={(e) => setMore({ ...more, notes: e.target.value })} />
          </div>
        </div>
      )}

      {error && <p className="sell-error">{error}</p>}

      <button className="btn btn-dark sell-submit" disabled={busy}>{busy ? t.calculating : t.submit}</button>
    </form>
  );
                                         }
