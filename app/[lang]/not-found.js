import Link from 'next/link';

// 找不到頁面（例如車輛已售出下架）：中英文都顯示，引導回在售車輛
export default function NotFound() {
  return (
    <main className="section" style={{ minHeight: '60vh', textAlign: 'center' }}>
      <p className="section-en">404</p>
      <h1 className="section-title">找不到這個頁面</h1>
      <p className="empty">這台車可能已經售出或下架，歡迎看看其他在售車輛。</p>
      <p className="empty">This page could not be found. The vehicle may have been sold.</p>
      <div className="contact-actions" style={{ justifyContent: 'center' }}>
        <Link href="/zh/vehicles" className="btn btn-dark">查看在售車輛</Link>
        <Link href="/en/vehicles" className="btn btn-light">View Vehicles</Link>
      </div>
    </main>
  );
}
