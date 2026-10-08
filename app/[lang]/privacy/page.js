import { alternates } from '../../../lib/i18n';
import '../../../styles/find.css';
import { PRIVACY, UPDATED } from '../../../lib/legal';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const t = PRIVACY[lang] || PRIVACY.zh;
  return { title: t.title, alternates: alternates(lang, '/privacy') };
}

export default async function PrivacyPage({ params }) {
  const { lang } = await params;
  const t = PRIVACY[lang] || PRIVACY.zh;
  return (
    <main className="section legal">
      <h1 className="section-title">{t.title}</h1>
      {t.sections.map(([h, paras]) => (
        <section key={h}>
          <h2>{h}</h2>
          {paras.map((p) => <p key={p}>{p}</p>)}
        </section>
      ))}
      <p className="legal-updated">{lang === 'en' ? 'Last updated: ' : '最後更新：'}{UPDATED}</p>
    </main>
  );
      }
