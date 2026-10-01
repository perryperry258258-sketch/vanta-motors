import Link from 'next/link';

export default function CarCard({ car }) {
  return (
    <Link href={`/cars/${car.slug}`} className="card">
      <div className="card-img">
        <img src={car.photos[0]} alt={car.title} loading="lazy" />
      </div>
      <div className="card-body">
        <h3>{car.title}</h3>
        {car.year && <p className="card-year">{car.year}</p>}
        <span className="card-more">了解更多</span>
      </div>
    </Link>
  );
        }
