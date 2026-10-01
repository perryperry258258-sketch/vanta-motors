import './admin.css';

export const metadata = {
  title: '後台',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
