import Link from 'next/link';
import CarCard from '../../components/CarCard';
import { site } from '../../lib/site';
import { latestCars } from '../../lib/cars';
import { dict, alternates } from '../../lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  return { alternates: alternates(lang) };
}

export default async function Home({ params }) {
  const { lang } = await params;
  const t = dict[lang];

  let latest = [];
  try {
    latest = await latestCars(6);
  } catch (e) {
    console.error(e);
  }

  return (
    <main>
      <section className="hero">
        <picture>
          <source media="(min-width: 900px)" srcSet="/hero-wide.jpg" />
          <img src="/hero.jpg" alt="" className="hero-img" />
        </picture>
        <div className="hero-text">
          <h1 className="hero-title">
            VANTA
            <span>MOTORS</span>
          </h1>
          <p className="hero-sub">{t.hero.tagline}</p>
          <Link href={`/${lang}/vehicles`} className="btn btn-dark">{t.hero.browse}</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          {lang === 'zh' && <p className="section-en">Latest Vehicles</p>}
          <h2 className="section-title">{t.home.latest}</h2>
        </div>
        {latest.length > 0 ? (
          <>
            <div className="grid">
              {latest.map((car) => <CarCard key={car.id} car={car} lang={lang} />)}
            </div>
            <div className="more-link">
              <Link href={`/${lang}/vehicles`} className="btn btn-light">{t.home.viewAll}</Link>
            </div>
          </>
        ) : (
          <p className="empty">{t.home.empty}</p>
        )}
      </section>

      <section className="about" id="about">
        <div className="about-inner">
          {lang === 'zh' && <p className="section-en">About Us</p>}
          <h2 className="section-title">{t.nav.about}</h2>
          {t.about.map((block) => (
            <div className="about-block" key={block.quote}>
              <p className="about-quote">{block.quote}</p>
              {block.paras.map((p) => <p key={p}>{p}</p>)}
            </div>
          ))}
        </div>
      </section>

      <section className="section contact" id="contact">
        {lang === 'zh' && <p className="section-en">Contact</p>}
        <h2 className="section-title">{t.home.contactTitle}</h2>
        <p className="contact-lead">{t.home.contactLead}</p>
        <div className="contact-actions">
          <a href={`tel:${site.phone}`} className="btn btn-dark">{t.car.call} {site.phoneDisplay}</a>
          <a href={site.lineUrl} className="btn btn-light" target="_blank" rel="noopener noreferrer">{t.car.line}</a>
        </div>
        <p className="contact-meta">{t.home.lineId}{site.lineId}</p>
      </section>
    </main>
  );
}
