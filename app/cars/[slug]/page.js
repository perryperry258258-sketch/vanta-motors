import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Gallery from '../../../components/Gallery';
import { getCarBySlug } from '../../../lib/cars';
import { site, formatPrice } from '../../../lib/site';

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
  const { slug } = await params;
  const car = await loadCar(slug);
  if (!car) return {};
  return {
    title: car.title,
    openGraph: { title: `${car.title}｜VANTA MOTORS`, images: car.photos.slice(0, 1) },
  };
}

export default async function CarPage({ params }) {
  const { slug } = await params;
  const car = await loadCar(slug);
  if (!car) notFound();

  const rows = [
    ['年份', car.year],
    ['車型', [car.brand, car.model].filter(Boolean).join(' ') || null],
    ['顏色', car.color],
    ['里程', car.mileage ? `${car.mileage.toLocaleString()} 公里` : null],
    ['價格', formatPrice(car.price, car.price_max)],
  ].filter(([, v]) => v);

  return (
    <main className="detail">
      {car.photos.length > 0 && <Gallery photos={car.photos} title={car.title} />}

      <div className="detail-body">
        <h1>{car.title}</h1>
        <dl className="specs">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {car.description && <p className="detail-desc">{car.description}</p>}
        <p className="detail-note">里程、車況與配備等細節，歡迎直接詢問我們。</p>
        <Link href="/cars" className="back-link">返回在售車輛</Link>
      </div>

      <div className="contact-bar">
        <div className="contact-bar-inner">
          <p>對這台車有興趣？</p>
          <div className="contact-buttons">
            <a href={`tel:${site.phone}`} className="btn btn-dark">電話詢問</a>
            <a href={site.lineUrl} className="btn btn-light" target="_blank" rel="noopener noreferrer">LINE 詢問</a>
          </div>
        </div>
      </div>
    </main>
  );
}
