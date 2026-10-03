import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Gallery from '../../../../components/Gallery';
import ContactBar from '../../../../components/ContactBar';
import EstimateBreakdown, { ValuationSummary } from '../../../../components/EstimateBreakdown';
import { getCarBySlug } from '../../../../lib/cars';
import { getAdminSupabase } from '../../../../lib/supabaseAdmin';
import { quoteForCar } from '../../../../lib/buyback/quote';
import { dict, alternates, displayTitle, formatPrice, formatMileage, hasCJK } from '../../../../lib/i18n';
import '../../../../styles/find.css';

export const dynamic = 'force-dynamic';

const LABELS = {
  zh: {
    price: '對客售價',
    market: '市場行情價',
    marketNote: '市場行情價依歷史新車價、年份、里程與目前同款車源初步推估，僅供參考；實際價格依車況、配備與里程確認。',
  },
  en: {
    price: 'Our Price',
    market: 'Market Range',
    marketNote: 'The market range is a rough estimate based on historical new-car price, age, mileage and similar listings, for reference only. Final pricing depends on condition, equipment and mileage.',
  },
};

const loadCar = cache(async (slug) => {
  try {
    return await getCarBySlug(slug);
  } catch (e) {
    console.error(e);
    return null;
  }
});

async function loadQuote(car) {
  try {
    return await quoteForCar(getAdminSupabase(), car);
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { lang, slug } = await params;
  const car = await loadCar(slug);
  if (!car) return {};
  const t = dict[lang];
  const title = displayTitle(car, lang);
  return {
    title,
    description: t.car.metaDescription(title),
    alternates: alternates(lang, `/vehicles/${slug}`),
    openGraph: {
      title: `${title} | VANTA MOTORS`,
      description: t.car.metaDescription(title),
      images: car.photos.slice(0, 1),
      locale: t.ogLocale,
      type: 'website',
    },
  };
}

export default async function VehiclePage({ params }) {
  const { lang, slug } = await params;
  const car = await loadCar(slug);
  if (!car) notFound();

  const t = dict[lang];
  const L = LABELS[lang] || LABELS.zh;
  const title = displayTitle(car, lang);
  const showText = (s) => s && (lang === 'zh' || !hasCJK(s));
  const quote = await loadQuote(car);
  const market = quote && quote.market;

  const rows = [
    [t.car.year, car.year],
    [t.car.model, [car.brand, car.model].filter(Boolean).join(' ') || null],
    [t.car.color, showText(car.color) ? car.color : null],
    [t.car.mileage, car.mileage ? formatMileage(lang, car.mileage) : null],
    [L.price, formatPrice(lang, car.price, car.price_max)],
    [L.market, market ? formatPrice(lang, market.low / 10000, market.high / 10000) : null],
  ].filter(([, v]) => v);

  return (
    <main className="detail">
      {car.photos.length > 0 && (
        <Gallery
          photos={car.photos}
          title={title}
          labels={{ photo: t.car.photo, prev: t.car.prev, next: t.car.next }}
        />
      )}

      <div className="detail-body">
        <h1>{title}</h1>
        <dl className="specs">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {market && (
          <>
            <ValuationSummary lang={lang} v={quote.valuation} />
            <p className="detail-note">{L.marketNote}</p>
            <EstimateBreakdown lang={lang} b={quote.breakdown} />
          </>
        )}
        {showText(car.description) && <p className="detail-desc">{car.description}</p>}
        <p className="detail-note">{t.car.note}</p>
        <Link href={`/${lang}/vehicles`} className="back-link">{t.car.back}</Link>
      </div>

      <ContactBar carId={car.id} title={title} lang={lang} />
    </main>
  );
}
