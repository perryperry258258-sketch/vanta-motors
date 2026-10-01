import CarSearch from '../../components/CarSearch';
import { searchCars, carFilters } from '../../lib/cars';

export const metadata = { title: '在售車輛' };
export const dynamic = 'force-dynamic';

export default async function CarsPage() {
  let initial = { cars: [], hasMore: false };
  let filters = { brands: [], years: [] };
  try {
    [initial, filters] = await Promise.all([searchCars(), carFilters()]);
  } catch (e) {
    console.error(e);
  }

  return (
    <main className="section">
      <div className="section-head">
        <p className="section-en">Vehicles</p>
        <h1 className="section-title">在售車輛</h1>
      </div>
      <CarSearch initial={initial} brands={filters.brands} years={filters.years} />
    </main>
  );
}
