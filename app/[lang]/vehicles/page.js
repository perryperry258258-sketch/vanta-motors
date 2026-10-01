import CarSearch from '../../../components/CarSearch';
import { searchCars, carFilters } from '../../../lib/cars';
import { dict, alternates } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  return { title: dict[lang].vehicles.title, alternates: alternates(lang, '/vehicles') };
}

export default async function VehiclesPage({ params }) {
  const { lang } = await params;
  const t = dict[lang];

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
        {lang === 'zh' && <p className="section-en">Vehicles</p>}
        <h1 className="section-title">{t.vehicles.title}</h1>
      </div>
      <CarSearch initial={initial} brands={filters.brands} years={filters.years} lang={lang} />
    </main>
  );
}
