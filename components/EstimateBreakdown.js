'use client';

// 估價計算明細（我要賣車、我要找車、車輛頁共用）
const T = {
  zh: {
    title: '估價計算明細',
    ref: '參考新車價', priceYear: '新車價年份', yearUnit: ' 年', historical: '歷史基準價參考：沒有這一年的新車價，使用最接近且不晚於車輛年份的新車價。', age: '車齡', years: '年', yearF: '年份係數', km: '里程', kmF: '里程係數',
    brandF: '品牌係數', modelF: '車款係數', cond: '車況', condF: '車況係數', market: '預估市場行情',
    noKm: '未提供',
  },
  en: {
    title: 'How this estimate is calculated',
    ref: 'Reference new-car price', priceYear: 'New-car price year', yearUnit: '', historical: 'Historical reference: no new-car price for this exact year, so the closest earlier year is used.', age: 'Vehicle age', years: 'yrs', yearF: 'Age factor', km: 'Mileage', kmF: 'Mileage factor',
    brandF: 'Brand factor', modelF: 'Model factor', cond: 'Condition', condF: 'Condition factor', market: 'Estimated market value',
    noKm: 'Not provided',
  },
};

const nt = (n) => `NT$${Math.round(Number(n)).toLocaleString('en-US')}`;
const f2 = (n) => Number(n).toFixed(2);

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
        <div className="breakdown-total"><dt>{t.market}</dt><dd>{nt(b.market)}</dd></div>
      </dl>
      {b.priceYear && b.priceYearExact === false && <p className="breakdown-extra">{t.historical}</p>}
      {extra && <p className="breakdown-extra">{extra}</p>}
    </details>
  );
      }
