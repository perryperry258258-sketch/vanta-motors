import { alternates } from '../../../lib/i18n';
import '../../../styles/find.css';
import { SERVICE, UPDATED } from '../../../lib/legal';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const t = SERVICE[lang] || SERVICE.zh;
  return { title: t.title, alternates: alternates(lang, '/service') };
}

export default async function ServicePage({ params }) {
  const { lang } = await params;
  const t = SERVICE[lang] || SERVICE.zh;
  return (
    <main className="section legal">
      <h1 className="section-title">{t.title}</h1>
      {t.paras.map((p) => <p key={p}>{p}</p>)}
      <p className="legal-updated">{lang === 'en' ? 'Last updated: ' : '最後更新：'}{UPDATED}</p>
    </main>
  );
      }
