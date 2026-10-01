import SellFlow from '../../../components/sell/SellFlow';
import { getAdminSupabase } from '../../../lib/supabaseAdmin';
import { DEFAULT_SETTINGS, taiwanYear } from '../../../lib/buyback/engine';
import { dict, alternates } from '../../../lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const t = dict[lang].sell;
  return {
    title: { absolute: t.metaTitle },
    description: t.metaDescription,
    alternates: alternates(lang, '/sell-your-car'),
    openGraph: { title: t.metaTitle, description: t.metaDescription, images: ['/hero-wide.jpg'] },
  };
}

async function loadOptions() {
  const db = getAdminSupabase();
  const [brandsRes, settingsRes] = await Promise.all([
    db.from('buyback_brands')
      .select('id, name, sort_order, buyback_models(id, name, sort_order, active)')
      .eq('active', true)
      .order('sort_order')
      .order('name'),
    db.from('buyback_settings').select('min_year').eq('id', 1).maybeSingle(),
  ]);
  if (brandsRes.error) throw brandsRes.error;
  const brands = (brandsRes.data || [])
    .map((b) => ({
      id: b.id,
      name: b.name,
      models: (b.buyback_models || [])
        .filter((m) => m.active)
        .sort((a, c) => a.sort_order - c.sort_order || a.name.localeCompare(c.name))
        .map((m) => ({ id: m.id, name: m.name })),
    }))
    .filter((b) => b.models.length > 0);
  return { brands, minYear: (settingsRes.data && settingsRes.data.min_year) || DEFAULT_SETTINGS.min_year };
}

export default async function SellPage({ params }) {
  const { lang } = await params;
  const t = dict[lang].sell;

  let options = null;
  try {
    options = await loadOptions();
  } catch (e) {
    console.error(e);
  }

  return (
    <main className="sell">
      <div className="sell-head">
        <h1 className="sell-title">{t.title}</h1>
        <p className="sell-sub">{t.subtitle}</p>
      </div>
      <SellFlow
        lang={lang}
        brands={options ? options.brands : []}
        minYear={options ? options.minYear : DEFAULT_SETTINGS.min_year}
        maxYear={taiwanYear()}
      />
    </main>
  );
}
