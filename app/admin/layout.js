import '../globals.css';
import './admin.css';
import Header from '../../components/Header';
import { jost } from '../../lib/fonts';

export const metadata = {
  title: '後台｜VANTA MOTORS',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function AdminLayout({ children }) {
  return (
    <html lang="zh-Hant-TW" className={jost.variable}>
      <body>
        <Header lang="zh" />
        {children}
      </body>
    </html>
  );
}
