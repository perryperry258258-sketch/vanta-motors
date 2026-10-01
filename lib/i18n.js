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
    nav: { home: '首頁', vehicles: '在售車輛', sell: '我要賣車', about: '關於我們', contact: '聯絡我們', openMenu: '開啟選單', closeMenu: '關閉選單' },
    hero: { tagline: '精選車輛・安心選擇', browse: '瀏覽車輛', sell: '我要賣車' },
    home: {
      latest: '最新車源',
      viewAll: '查看全部車輛',
      empty: '車源整理中，歡迎直接透過 LINE 詢問。',
      contactTitle: '對車輛有興趣？',
      contactLead: '歡迎透過 LINE 直接聯絡我們。',
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
      emptyLink: '透過 LINE 詢問',
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
      line: 'LINE 詢問',
      photo: '照片',
      prev: '上一張',
      next: '下一張',
      metaDescription: (title) => `${title}，歡迎聯絡 VANTA MOTORS 了解車況、里程與實際價格。`,
    },
    sell: {
      metaTitle: 'VANTA MOTORS｜中古車收購｜我要賣車',
      metaDescription: '選擇品牌、車型、年份與里程，立即查看 VANTA MOTORS 預估收購行情，再透過 LINE 取得正式報價。',
      title: '賣掉你的愛車',
      subtitle: '立即查詢預估收購行情',
      brand: '品牌',
      model: '車型',
      year: '年份',
      mileage: '目前里程',
      selectBrand: '選擇品牌',
      selectModel: '選擇車型',
      selectBrandFirst: '請先選擇品牌',
      selectYear: '選擇年份',
      mileagePlaceholder: '例如 42,000',
      quick: [
        ['3萬以下', 20000],
        ['3～5萬', 40000],
        ['5～8萬', 65000],
        ['8～10萬', 90000],
        ['10萬以上', 120000],
      ],
      submit: '查看預估收購行情',
      calculating: '計算中…',
      missing: '請完成品牌、車型、年份與里程。',
      error: '暫時無法取得行情，歡迎直接透過 LINE 詢問。',
      unavailable: '估價系統整理中，歡迎直接透過 LINE 詢問收購。',
      notListed: '找不到您的車型？歡迎直接透過 LINE 詢問。',
      yourCar: '您的愛車',
      range: '預估收購行情',
      limited: '資料有限，此結果僅供初步參考。',
      disclaimer: '此價格為依車型、年份及里程計算的初步預估行情，實際收購價格仍需依車況、配備、事故紀錄及現場檢查確認。',
      updated: '行情資料更新：',
      noData: '目前尚無足夠行情資料，歡迎直接聯絡 VANTA 進行估價。',
      lineCta: 'LINE 詢問正式報價',
      lineCtaNoData: 'LINE 詢問估價',
      copy: '複製詢問內容',
      copied: '已複製，在 LINE 對話中貼上即可。',
      fallback: '若 LINE 沒有自動開啟，請搜尋 LINE ID 加入好友，再貼上詢問內容。',
      photosTitle: '想取得更精準報價？',
      photosLead: '上傳車輛照片',
      photosNote: '照片為選填。有照片，我們能更快給您正式報價。',
      slots: ['車頭', '車尾', '左側', '右側', '內裝', '儀表板', '其他'],
      uploading: '上傳中…',
      uploadFailed: '上傳失敗，請重選',
      remove: '移除照片',
      contactOptional: '聯絡方式（選填）',
      name: '稱呼',
      phone: '電話',
      lineId: '您的 LINE ID',
      sendLine: '透過 LINE 傳送給 VANTA',
      restart: '重新估價',
    },
  },

  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    meta: {
      title: 'VANTA MOTORS | Selected Pre-Owned Vehicles in Taiwan',
      template: '%s | VANTA MOTORS',
      description: 'VANTA MOTORS offers carefully selected pre-owned vehicles in Taiwan. Contact us for vehicle condition, mileage, specifications and current pricing.',
    },
    nav: { home: 'Home', vehicles: 'Vehicles', sell: 'Sell Your Car', about: 'About Us', contact: 'Contact', openMenu: 'Open menu', closeMenu: 'Close menu' },
    hero: { tagline: 'Carefully selected. Confidently chosen.', browse: 'Browse Vehicles', sell: 'Sell Your Car' },
    home: {
      latest: 'Latest Vehicles',
      viewAll: 'View All Vehicles',
      empty: 'New arrivals are on the way. Reach out to us on LINE anytime.',
      contactTitle: 'Interested in a vehicle?',
      contactLead: 'Get in touch with us directly on LINE.',
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
      emptyLink: 'message us on LINE',
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
      line: 'Contact via LINE',
      photo: 'Photo',
      prev: 'Previous photo',
      next: 'Next photo',
      metaDescription: (title) => `${title} at VANTA MOTORS. Contact us for condition, mileage and current pricing.`,
    },
    sell: {
      metaTitle: 'VANTA MOTORS | Sell Your Car in Taiwan',
      metaDescription: 'Choose your brand, model, year and mileage to see an estimated buyback range from VANTA MOTORS, then get a formal quote on LINE.',
      title: 'Sell Your Car',
      subtitle: 'Get an Estimated Buyback Value',
      brand: 'Brand',
      model: 'Model',
      year: 'Year',
      mileage: 'Current mileage',
      selectBrand: 'Select brand',
      selectModel: 'Select model',
      selectBrandFirst: 'Select a brand first',
      selectYear: 'Select year',
      mileagePlaceholder: 'e.g. 42,000',
      quick: [
        ['Under 30K km', 20000],
        ['30–50K km', 40000],
        ['50–80K km', 65000],
        ['80–100K km', 90000],
        ['Over 100K km', 120000],
      ],
      submit: 'Get an Estimated Buyback Value',
      calculating: 'Calculating…',
      missing: 'Please select brand, model, year and mileage.',
      error: 'We could not load an estimate right now. Please contact us on LINE.',
      unavailable: 'Our estimate tool is being updated. Please contact us on LINE for a quote.',
      notListed: "Can't find your model? Contact us on LINE.",
      yourCar: 'Your vehicle',
      range: 'Estimated Buyback Range',
      limited: 'Limited data available. This estimate is for reference only.',
      disclaimer: 'This is an initial estimated buyback range based on the vehicle model, year and mileage. The final offer may vary depending on vehicle condition, equipment, accident history and inspection.',
      updated: 'Pricing data updated: ',
      noData: "We don't have enough pricing data for this vehicle yet. Contact VANTA for a personal quote.",
      lineCta: 'Contact VANTA on LINE',
      lineCtaNoData: 'Get a Quote on LINE',
      copy: 'Copy message',
      copied: 'Copied. Paste it into your LINE chat.',
      fallback: "If LINE doesn't open automatically, search for our LINE ID, add us, then paste the message.",
      photosTitle: 'Want a More Accurate Quote?',
      photosLead: 'Upload Vehicle Photos',
      photosNote: 'Photos are optional, but they help us give you a formal quote faster.',
      slots: ['Front', 'Rear', 'Left side', 'Right side', 'Interior', 'Dashboard', 'Other'],
      uploading: 'Uploading…',
      uploadFailed: 'Upload failed, try again',
      remove: 'Remove photo',
      contactOptional: 'Contact details (optional)',
      name: 'Name',
      phone: 'Phone',
      lineId: 'Your LINE ID',
      sendLine: 'Send to VANTA on LINE',
      restart: 'Start over',
    },
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
