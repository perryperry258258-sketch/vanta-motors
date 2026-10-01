import Link from 'next/link';
import { dict, displayTitle } from '../lib/i18n';

export default function CarCard({ car, lang = 'zh' }) {
  const title = displayTitle(car, lang);
  return (
    <Link href={`/${lang}/vehicles/${car.slug}`} className="card">
      <div className="card-img">
        {car.cover && <img src={car.cover} alt={title} loading="lazy" />}
      </div>
      <div className="card-body">
        <h3>{title}</h3>
        {car.year && <p className="card-year">{car.year}</p>}
        <span className="card-more">{dict[lang].car.viewDetails}</span>
      </div>
    </Link>
  );
}
