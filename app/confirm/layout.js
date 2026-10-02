import '../globals.css';
import '../../styles/deal.css';
import { jost } from '../../lib/fonts';

export const metadata = {
  title: '成交確認｜VANTA MOTORS',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function ConfirmLayout({ children }) {
  return (
    <html lang="zh-Hant-TW" className={jost.variable}>
      <body>{children}</body>
    </html>
  );
}
