import { getSupabase } from '../lib/supabase';
import { SITE_URL } from '../lib/i18n';

export const revalidate = 3600;

function entries(path, lastModified) {
  const languages = { 'zh-Hant-TW': `${SITE_URL}/zh${path}`, en: `${SITE_URL}/en${path}` };
  return ['zh', 'en'].map((lang) => ({
    url: `${SITE_URL}/${lang}${path}`,
    lastModified,
    alternates: { languages },
  }));
}

export default async function sitemap() {
  const items = [...entries(''), ...entries('/vehicles'), ...entries('/sell-your-car')];
  try {
    const { data } = await getSupabase()
      .from('cars')
      .select('slug, updated_at')
      .eq('status', 'published')
      .limit(2000);
    (data || []).forEach((c) => items.push(...entries(`/vehicles/${c.slug}`, c.updated_at)));
  } catch (e) {
    console.error(e);
  }
  return items;
}
