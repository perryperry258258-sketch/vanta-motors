export const LOCALES = ['zh', 'en'];

export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

export const dict = {
  zh: {
    htmlLang: 'zh-Hant-TW',
    ogLocale: 'zh_TW',
    meta: {
      title: 'VANTA MOTORS｜精選中古車｜台灣',
      template: '%s｜VANTA MOTORS',
      description: 'VANTA MOTORS 精選中古車，提供車輛資訊與市場行情參考，歡迎聯絡我們了解車況與實際價格。',
    },
    nav: { home: '首頁', vehicles: '在售車輛', about: '關於我們', contact: '聯絡我們', openMenu: '開啟選單', closeMenu: '關閉選單' },
    hero: { tagline: '精選車輛・安心選擇', browse: '瀏覽車輛' },
    home: {
      latest: '最新車源',
      viewAll: '查看全部車輛',
      empty: '車源整理中，歡迎直接來電或 LINE 詢問。',
      contactTitle: '對車輛有興趣？',
      contactLead: '歡迎直接聯絡我們。',
      lineId: 'LINE ID：',
    },
    about: [
      {
        quote: '每一台車，都值得被認真挑選。',
        paras: [
          '我們相信，一台車不只是交通工具，也是每天生活的一部分。',
          '因此，我們專注於挑選值得推薦的中古車，從車輛來源、整體狀況到實際使用感受，盡可能替客人把關。',
          '我們不追求車輛數量，而是在意每一台車是否值得推薦。',
        ],
      },
      {
        quote: '透明，是我們與客人相處的方式。',
        paras: [
          '車況、里程、配備與價格，都歡迎直接向我們詢問。',
          '不過度包裝，也不刻意隱藏。',
          '我們更重視的是，客人了解車況之後，能夠放心做出自己的選擇。',
        ],
      },
    ],
    vehicles: {
      title: '在售車輛',
      searchPlaceholder: '搜尋車型，例如 320i',
      searchLabel: '搜尋車型',
      brandLabel: '品牌',
      yearLabel: '年份',
      allBrands: '所有品牌',
      allYears: '所有年份',
      emptyBefore: '目前沒有符合條件的車輛。可以清除篩選，或直接',
      emptyLink: '來電詢問',
      emptyAfter: '想找的車款。',
      loadMore: '載入更多',
      loading: '載入中…',
    },
    car: {
      viewDetails: '了解更多',
      year: '年份',
      model: '車型',
      color: '顏色',
      mileage: '里程',
      market: '市場行情',
      note: '實際價格、里程、車況與配備，歡迎直接聯絡我們。',
      back: '返回在售車輛',
      interested: '對這台車有興趣？',
      call: '電話詢問',
      line: 'LINE 詢問',
      photo: '照片',
      prev: '上一張',
      next: '下一張',
      metaDescription: (title) => `${title}，歡迎聯絡 VANTA MOTORS 了解車況、里程與實際價格。`,
    },
    footer: { call: '電話' },
  },

  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    meta: {
      title: 'VANTA MOTORS | Selected Pre-Owned Vehicles in Taiwan',
      template: '%s | VANTA MOTORS',
      description: 'VANTA MOTORS offers carefully selected pre-owned vehicles in Taiwan. Contact us for vehicle condition, mileage, specifications and current pricing.',
    },
    nav: { home: 'Home', vehicles: 'Vehicles', about: 'About Us', contact: 'Contact', openMenu: 'Open menu', closeMenu: 'Close menu' },
    hero: { tagline: 'Carefully selected. Confidently chosen.', browse: 'Browse Vehicles' },
    home: {
      latest: 'Latest Vehicles',
      viewAll: 'View All Vehicles',
      empty: 'New arrivals are on the way. Call us or reach out on LINE anytime.',
      contactTitle: 'Interested in a vehicle?',
      contactLead: 'Get in touch with us directly.',
      lineId: 'LINE ID: ',
    },
    about: [
      {
        quote: 'Every vehicle deserves to be carefully selected.',
        paras: [
          'We believe a car is more than just a means of transportation. It is part of everyday life.',
          'At VANTA MOTORS, we carefully select pre-owned vehicles based on their overall condition, source and value.',
          'Rather than focusing on quantity, we focus on offering vehicles that we would be confident recommending.',
        ],
      },
      {
        quote: 'Transparency is how we build trust.',
        paras: [
          'We believe customers deserve clear and honest information.',
          'For details regarding mileage, condition, specifications and pricing, please contact us directly.',
          'Our goal is simple: to help you find a vehicle that feels right for you.',
        ],
      },
    ],
    vehicles: {
      title: 'Vehicles',
      searchPlaceholder: 'Search by model, e.g. 320i',
      searchLabel: 'Search by model',
      brandLabel: 'Brand',
      yearLabel: 'Year',
      allBrands: 'All brands',
      allYears: 'All years',
      emptyBefore: 'No vehicles match your search. Try clearing the filters, or',
      emptyLink: 'call us',
      emptyAfter: 'about the car you have in mind.',
      loadMore: 'Load more',
      loading: 'Loading…',
    },
    car: {
      viewDetails: 'View Details',
      year: 'Year',
      model: 'Model',
      color: 'Color',
      mileage: 'Mileage',
      market: 'Market Range',
      note: 'For the latest price, mileage, vehicle condition and specifications, please contact us directly.',
      back: 'Back to all vehicles',
      interested: 'Interested in this vehicle?',
      call: 'Call Us',
      line: 'Contact via LINE',
      photo: 'Photo',
      prev: 'Previous photo',
      next: 'Next photo',
      metaDescription: (title) => `${title} at VANTA MOTORS. Contact us for condition, mileage and current pricing.`,
    },
    footer: { call: 'Call' },
  },
};

export function alternates(lang, path = '') {
  return {
    canonical: `/${lang}${path}`,
    languages: {
      'zh-Hant-TW': `/zh${path}`,
      en: `/en${path}`,
      'x-default': `/zh${path}`,
    },
  };
}

export function hasCJK(s) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(s || ''));
}

export function displayTitle(car, lang) {
  return lang === 'en' && car.title_en ? car.title_en : car.title;
}

function toEnglishAmount(wan) {
  return wan >= 100 ? `${+(wan / 100).toFixed(2)}M` : `${wan * 10}K`;
}

// 價格單位：萬
export function formatPrice(lang, price, priceMax) {
  const lo = price || priceMax || null;
  const hi = price && priceMax && priceMax !== price ? priceMax : null;
  if (!lo) return lang === 'en' ? 'Price on request' : '歡迎洽詢';
  if (lang === 'en') {
    return hi
      ? `Approx. NT$${toEnglishAmount(lo)}–${toEnglishAmount(hi)}`
      : `Approx. NT$${toEnglishAmount(lo)}`;
  }
  return hi ? `約${lo}–${hi}萬` : `約${lo}萬`;
}

export function formatMileage(lang, km) {
  const n = Number(km);
  return lang === 'en' ? `${n.toLocaleString('en-US')} km` : `${n.toLocaleString('zh-TW')} 公里`;
}
