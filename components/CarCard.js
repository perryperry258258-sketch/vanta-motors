import Link from 'next/link';
import { dict, displayTitle, formatPrice } from '../lib/i18n';
import { carTags } from '../lib/carTags';

const MARKET = { zh: '行情參考 ', en: 'Est. ' };

// market：沒有填價格的車，顯示系統算出的大概市場行情（{ low, high }，單位元）
export default function CarCard({ car, lang = 'zh', market = null }) {
  const title = displayTitle(car, lang);
  const hasPrice = car.price || car.price_max;
  const tags = carTags(car, lang);
  return (
    <Link href={`/${lang}/vehicles/${car.slug}`} className={`card${car.sold_at ? ' card-sold' : ''}`}>
      <div className="card-img">
        {car.cover && <img src={car.cover} alt={title} loading="lazy" />}
        {tags.length > 0 && (
          <div className="card-tags">
            {tags.map(([k, label]) => <span key={k} className={`car-tag car-tag-${k}`}>{label}</span>)}
          </div>
        )}
      </div>
      <div className="card-body">
        <h3>{title}</h3>
        {car.year && <p className="card-year">{car.year}</p>}
        {car.sold_at ? null : hasPrice ? (
          <p className="card-price">{formatPrice(lang, car.price, car.price_max)}</p>
        ) : market ? (
          <p className="card-price card-price-market">
            {MARKET[lang] || MARKET.zh}
            {formatPrice(lang, market.low / 10000, market.high / 10000)}
          </p>
        ) : null}
        <span className="card-more">{dict[lang].car.viewDetails}</span>
      </div>
    </Link>
  );
}
