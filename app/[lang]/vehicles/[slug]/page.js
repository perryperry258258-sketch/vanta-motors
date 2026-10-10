import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Gallery from '../../../../components/Gallery';
import ContactBar from '../../../../components/ContactBar';
import { getCarBySlug } from '../../../../lib/cars';
import { getAdminSupabase } from '../../../../lib/supabaseAdmin';
import { quoteForCar } from '../../../../lib/buyback/quote';
import { dict, alternates, displayTitle, formatPrice, formatMileage, hasCJK } from '../../../../lib/i18n';
import { carTags } from '../../../../lib/carTags';
import '../../../../styles/find.css';

export const dynamic = 'force-dynamic';

const LABELS = {
  zh: {
    partnerTag: 'VANTA 合作車源',
    selectedTag: 'VANTA MOTORS 精選車輛',
    partnerRole: '車輛由合作車商提供，VANTA 協助媒合與安排看車。',
    partnerNote: '此車為 VANTA MOTORS 合作車源。VANTA 協助提供車輛展示、媒合、看車安排及資訊轉達服務。車輛實際狀況、最終價格、交易條件及交車相關事項，將由實際車輛提供者與您確認。網站資訊主要提供找車參考，實際車況建議於看車時親自確認，並以實車檢視、相關紀錄及正式交易文件為準。',
    descTitle: '車輛提供者資訊',
    descNote: '※以上車輛描述由實際車輛提供者提供，VANTA 協助整理刊登。實際車況、事故及維修紀錄，請於看車時向車輛提供者確認，並以實車檢視及相關紀錄為準。',
    price: '對客售價',
    market: '系統行情參考區間',
    marketNote: '「系統行情參考區間」為 VANTA 依車型、年份、里程、歷史新車價格及可取得之同款車源資料進行初步估算，提供找車時參考。此區間並非實際車輛售價、收購報價或交易價格；實際價格仍應依個別車況、配備、里程、車輛所在地及交易條件，由實際交易雙方確認。',
  },
  en: {
    partnerTag: 'Selected Partner Vehicle',
    selectedTag: 'VANTA MOTORS Selected Vehicle',
    partnerRole: 'Provided by a partner dealer. VANTA assists with matching and viewing arrangements.',
    partnerNote: 'This is a VANTA MOTORS partner vehicle. VANTA provides listing, matching, viewing arrangements and information relay. The actual condition, final price, transaction terms and delivery will be confirmed with you by the vehicle provider. Website information is for reference; please check the condition in person at the viewing, subject to inspection, records and the formal transaction documents.',
    descTitle: 'Information from the vehicle provider',
    descNote: '* The description above is provided by the vehicle provider and organized by VANTA. Please confirm the actual condition, accident and service history with the provider at the viewing, subject to inspection and records.',
    price: 'Our Price',
    market: 'System Reference Range',
    marketNote: 'The System Reference Range is VANTA\'s preliminary estimate based on model, year, mileage, historical new-car prices and available listings, for reference when searching. It is not a vehicle sale price, buyback offer or transaction price; the actual price is confirmed by the parties based on condition, equipment, mileage, location and terms.',
  },
};

const loadCar = cache(async (slug) => {
  try {
    return await getCarBySlug(slug);
  } catch (e) {
    console.error(e);
    return null;
  }
});

async function loadQuote(car) {
  try {
    return await quoteForCar(getAdminSupabase(), car);
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { lang, slug } = await params;
  const car = await loadCar(slug);
  if (!car) return {};
  const t = dict[lang];
  const title = displayTitle(car, lang);
  return {
    title,
    description: t.car.metaDescription(title),
    alternates: alternates(lang, `/vehicles/${slug}`),
    openGraph: {
      title: `${title} | VANTA MOTORS`,
      description: t.car.metaDescription(title),
      images: car.photos.slice(0, 1),
      locale: t.ogLocale,
      type: 'website',
    },
  };
}

export default async function VehiclePage({ params }) {
  const { lang, slug } = await params;
  const car = await loadCar(slug);
  if (!car) notFound();

  const t = dict[lang];
  const L = LABELS[lang] || LABELS.zh;
  const title = displayTitle(car, lang);
  const showText = (s) => s && (lang === 'zh' || !hasCJK(s));
  const quote = await loadQuote(car);
  // 網站只顯示市場行情區間；系統估值、折舊率、計算明細屬於內部資料，不公開
  const market = quote && quote.publicOk ? quote.market : null;

  const rows = [
    [t.car.year, car.year],
    [t.car.model, [car.brand, car.model].filter(Boolean).join(' ') || null],
    [t.car.color, showText(car.color) ? car.color : null],
    [t.car.mileage, car.mileage ? formatMileage(lang, car.mileage) : null],
    [L.price, formatPrice(lang, car.price, car.price_max)],
    [L.market, market ? formatPrice(lang, market.low / 10000, market.high / 10000) : null],
  ].filter(([, v]) => v);

  return (
    <main className="detail">
      {car.photos.length > 0 && (
        <Gallery
          photos={car.photos}
          title={title}
          labels={{ photo: t.car.photo, prev: t.car.prev, next: t.car.next }}
        />
      )}

      <div className="detail-body">
        <p className="detail-tag">{car.source_owner_id ? L.partnerTag : L.selectedTag}</p>
        <h1>{title}</h1>
        {carTags(car, lang).length > 0 && (
          <div className="detail-tags">
            {carTags(car, lang).map(([k, label]) => <span key={k} className={`car-tag car-tag-${k}`}>{label}</span>)}
          </div>
        )}
        {car.source_owner_id && <p className="detail-note" style={{ marginTop: 4 }}>{L.partnerRole}</p>}
        <dl className="specs">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {market && <p className="detail-note">{L.marketNote}</p>}
        {showText(car.description) && car.source_owner_id && (
          <div className="detail-provider">
            <p className="detail-tag">{L.descTitle}</p>
            <p className="detail-desc">{car.description}</p>
            <p className="detail-note">{L.descNote}</p>
          </div>
        )}
        {showText(car.description) && !car.source_owner_id && <p className="detail-desc">{car.description}</p>}
        {car.source_owner_id && <p className="detail-note">{L.partnerNote}</p>}
        <p className="detail-note">{t.car.note}</p>
        <Link href={`/${lang}/vehicles`} className="back-link">{t.car.back}</Link>
      </div>

      <ContactBar carId={car.id} title={title} lang={lang} />
    </main>
  );
}
