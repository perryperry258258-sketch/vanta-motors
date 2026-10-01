import Link from 'next/link';
import CarCard from '../components/CarCard';
import { site, publishedCars } from '../lib/site';

export default function Home() {
  const latest = publishedCars().slice(0, 6);

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
          <p className="hero-sub">{site.tagline}</p>
          <Link href="/cars" className="btn btn-dark">瀏覽車輛</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="section-en">Latest Vehicles</p>
          <h2 className="section-title">最新車源</h2>
        </div>
        <div className="grid">
          {latest.map((car) => <CarCard key={car.slug} car={car} />)}
        </div>
        <div className="more-link">
          <Link href="/cars" className="btn btn-light">查看全部車輛</Link>
        </div>
      </section>

      <section className="about" id="about">
        <div className="about-inner">
          <p className="section-en">About Us</p>
          <h2 className="section-title">關於我們</h2>
          <div className="about-block">
            <p className="about-quote">每一台車，都值得被認真挑選。</p>
            <p>我們相信，一台車不只是交通工具，也是每天生活的一部分。</p>
            <p>因此，我們專注於挑選值得推薦的中古車，從車輛來源、整體狀況到實際使用感受，盡可能替客人把關。</p>
            <p>我們不追求車輛數量，而是在意每一台車是否值得推薦。</p>
          </div>
          <div className="about-block">
            <p className="about-quote">透明，是我們與客人相處的方式。</p>
            <p>車況、里程、配備與價格，都歡迎直接向我們詢問。</p>
            <p>不過度包裝，也不刻意隱藏。</p>
            <p>我們更重視的是，客人了解車況之後，能夠放心做出自己的選擇。</p>
          </div>
        </div>
      </section>

      <section className="section contact" id="contact">
        <p className="section-en">Contact</p>
        <h2 className="section-title">對車輛有興趣？</h2>
        <p className="contact-lead">歡迎直接聯絡我們。</p>
        <div className="contact-actions">
          <a href={`tel:${site.phone}`} className="btn btn-dark">電話詢問 {site.phoneDisplay}</a>
          <a href={site.lineUrl} className="btn btn-light" target="_blank" rel="noopener noreferrer">LINE 詢問</a>
        </div>
        <p className="contact-meta">LINE ID：{site.lineId}</p>
      </section>
    </main>
  );
}
