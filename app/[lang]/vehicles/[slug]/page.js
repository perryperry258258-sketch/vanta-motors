import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Gallery from '../../../../components/Gallery';
import ContactBar from '../../../../components/ContactBar';
import { getCarBySlug } from '../../../../lib/cars';
import { dict, alternates, displayTitle, formatPrice, formatMileage, hasCJK } from '../../../../lib/i18n';

export const dynamic = 'force-dynamic';

const loadCar = cache(async (slug) => {
  try {
    return await getCarBySlug(slug);
  } catch (e) {
    console.error(e);
    return null;
  }
});

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
  const title = displayTitle(car, lang);
  const showText = (s) => s && (lang === 'zh' || !hasCJK(s));

  const rows = [
    [t.car.year, car.year],
    [t.car.model, [car.brand, car.model].filter(Boolean).join(' ') || null],
    [t.car.color, showText(car.color) ? car.color : null],
    [t.car.mileage, car.mileage ? formatMileage(lang, car.mileage) : null],
    [t.car.market, formatPrice(lang, car.price, car.price_max)],
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
        {showText(car.description) && <p className="detail-desc">{car.description}</p>}
        <p className="detail-note">{t.car.note}</p>
        <Link href={`/${lang}/vehicles`} className="back-link">{t.car.back}</Link>
      </div>

      <ContactBar carId={car.id} title={title} lang={lang} />
    </main>
  );
          }
