import CarSearch from '../../components/CarSearch';
import { publishedCars } from '../../lib/site';

export const metadata = { title: '在售車輛' };

export default function CarsPage() {
  return (
    <main className="section">
      <div className="section-head">
        <p className="section-en">Vehicles</p>
        <h1 className="section-title">在售車輛</h1>
      </div>
      <CarSearch cars={publishedCars()} />
    </main>
  );
}
