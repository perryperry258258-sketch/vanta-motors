import '../globals.css';
import '../admin/admin.css';
import { jost } from '../../lib/fonts';

export const metadata = {
  title: '合作夥伴｜VANTA MOTORS',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function PartnerLayout({ children }) {
  return (
    <html lang="zh-Hant-TW" className={jost.variable}>
      <body>{children}</body>
    </html>
  );
}
