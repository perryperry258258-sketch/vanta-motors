import { Jost } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import { LogoMark } from '../components/Logo';
import { site } from '../lib/site';

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-latin',
  display: 'swap',
});

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: 'VANTA MOTORS｜精選中古車', template: '%s｜VANTA MOTORS' },
  description: '精選車輛・安心選擇。歡迎預約看車，電話或 LINE 直接詢問。',
  openGraph: {
    siteName: 'VANTA MOTORS',
    images: ['/hero-wide.jpg'],
    locale: 'zh_TW',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant-TW" className={jost.variable}>
      <body>
        <Header />
        {children}
        <footer className="footer">
          <div className="footer-inner">
            <LogoMark size={22} />
            <p>
              電話 <a href={`tel:${site.phone}`}>{site.phoneDisplay}</a>
              <span className="footer-gap" />
              LINE ID {site.lineId}
            </p>
            <p className="footer-copy">© {new Date().getFullYear()} VANTA MOTORS</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
