'use client';

// 估價計算明細與估值摘要（我要賣車、我要找車、車輛頁共用）
const T = {
  zh: {
    title: '估價計算明細',
    ref: '參考新車價', priceYear: '新車價年份', yearUnit: ' 年', historical: '歷史基準價參考：沒有這一年的新車價，使用最接近的年份。', age: '車齡', years: '年', yearF: '年份係數', km: '里程', kmF: '里程係數',
    brandF: '品牌係數', modelF: '車款係數', cond: '車況', condF: '車況係數', market: '依新車價推算',
    noKm: '未提供',
  },
  en: {
    title: 'How this estimate is calculated',
    ref: 'Reference new-car price', priceYear: 'New-car price year', yearUnit: '', historical: 'Historical reference: no new-car price for this exact year, so the closest year is used.', age: 'Vehicle age', years: 'yrs', yearF: 'Age factor', km: 'Mileage', kmF: 'Mileage factor',
    brandF: 'Brand factor', modelF: 'Model factor', cond: 'Condition', condF: 'Condition factor', market: 'Value from new-car price',
    noKm: 'Not provided',
  },
};

const S = {
  zh: {
    hist: '歷史新車價',
    about: '約 ',
    estimated: '（估算）',
    inferredNote: '※ 此價格依鄰近年份或同車型資料推估，不是該年份官方售價',
    medianNote: (n) => `（該年份 ${n} 個版本的中位數）`,
    market: '目前市場車源',
    listings: (n) => `VANTA 現有同款車源 ${n} 台`,
    noListings: '目前同款車源不足，以新車價推算為主',
    value: '系統估值',
    dep: '估算折舊率',
    grade: '資料可信度',
  },
  en: {
    hist: 'Historical new-car price',
    about: 'approx. ',
    estimated: ' (estimated)',
    inferredNote: '* Estimated from nearby years or the same model, not the official price for that year',
    medianNote: (n) => ` (median of ${n} versions that year)`,
    market: 'Current listings',
    listings: (n) => `${n} similar vehicles listed by VANTA`,
    noListings: 'Not enough similar listings; based mainly on new-car price',
    value: 'System valuation',
    dep: 'Estimated depreciation',
    grade: 'Data confidence',
  },
};

const GRADE = {
  zh: { A: 'A｜資料充足', B: 'B｜新車價可靠、車源較少', C: 'C｜部分資料為推估', D: 'D｜資料不足，僅供粗略參考' },
  en: { A: 'A | Strong data', B: 'B | Reliable new-car price, few listings', C: 'C | Partly estimated', D: 'D | Limited data, rough guide only' },
};

const nt = (n) => `NT$${Math.round(Number(n)).toLocaleString('en-US')}`;
const f2 = (n) => Number(n).toFixed(2);

// 估值摘要：歷史新車價、目前車源、系統估值、折舊率、資料可信度
export function ValuationSummary({ lang = 'zh', v }) {
  if (!v) return null;
  const t = S[lang] || S.zh;
  const h = v.hist;
  const inferred = h && h.price_type !== 'original';
  const rows = [];
  if (h) {
    rows.push([
      t.hist,
      `${inferred ? t.about : ''}${nt(h.price)}${inferred ? t.estimated : ''}`,
      [h.version, h.match === 'year' && h.versionCount > 1 ? t.medianNote(h.versionCount).trim() : ''].filter(Boolean).join(' '),
    ]);
  }
  rows.push([
    t.market,
    v.comps && v.comps.count >= 2 ? `${nt(v.comps.low)} – ${nt(v.comps.high)}` : '—',
    v.comps && v.comps.count >= 2 ? t.listings(v.comps.count) : t.noListings,
  ]);
  if (v.value) rows.push([t.value, nt(v.value), '']);
  if (v.depreciation !== null && v.depreciation !== undefined) rows.push([t.dep, `${Math.round(v.depreciation * 100)}%`, '']);
  if (v.grade) rows.push([t.grade, (GRADE[lang] || GRADE.zh)[v.grade], '']);

  return (
    <div className="valuation">
      <dl>
        {rows.map(([k, val, sub]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              {val}
              {sub && <small>{sub}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {inferred && <p className="breakdown-extra">{t.inferredNote}</p>}
    </div>
  );
}

export default function EstimateBreakdown({ lang = 'zh', b, extra }) {
  if (!b) return null;
  const t = T[lang] || T.zh;
  const rows = [
    [t.ref, nt(b.referencePrice)],
    ...(b.priceYear ? [[t.priceYear, `${b.priceYear}${t.yearUnit}`]] : []),
    [t.age, `${b.age} ${t.years}`],
    [t.yearF, f2(b.yearFactor)],
    [t.km, b.mileage === null || b.mileage === undefined ? t.noKm : `${Number(b.mileage).toLocaleString('en-US')} km`],
    [t.kmF, f2(b.mileageFactor)],
    [t.brandF, f2(b.brandFactor)],
    [t.modelF, f2(b.modelFactor)],
    [t.cond, lang === 'en' ? b.conditionLabelEn : b.conditionLabelZh],
    [t.condF, f2(b.conditionFactor)],
  ];
  return (
    <details className="breakdown">
      <summary>{t.title}</summary>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {b.market ? <div className="breakdown-total"><dt>{t.market}</dt><dd>{nt(b.market)}</dd></div> : null}
      </dl>
      {b.priceYear && b.priceYearExact === false && <p className="breakdown-extra">{t.historical}</p>}
      {extra && <p className="breakdown-extra">{extra}</p>}
    </details>
  );
      }
