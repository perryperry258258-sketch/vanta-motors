import { notFound } from 'next/navigation';
import '../globals.css';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { jost } from '../../lib/fonts';
import { LOCALES, SITE_URL, dict } from '../../lib/i18n';

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const t = dict[lang];
  if (!t) return {};
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.meta.title, template: t.meta.template },
    description: t.meta.description,
    openGraph: {
      siteName: 'VANTA MOTORS',
      title: t.meta.title,
      description: t.meta.description,
      images: ['/hero-wide.jpg'],
      locale: t.ogLocale,
      type: 'website',
    },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default async function LangLayout({ children, params }) {
  const { lang } = await params;
  if (!LOCALES.includes(lang)) notFound();

  return (
    <html lang={dict[lang].htmlLang} className={jost.variable}>
      <body>
        <Header lang={lang} />
        {children}
        <Footer lang={lang} />
      </body>
    </html>
  );
}
