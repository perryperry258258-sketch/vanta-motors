export const site = {
  name: 'VANTA MOTORS',
  tagline: '精選車輛・安心選擇',
  phone: '0919481060',
  phoneDisplay: '0919-481-060',
  lineId: 'perry258',
  lineUrl: 'https://line.me/ti/p/~perry258',
};

// 第一階段示範資料，之後改成從資料庫讀取
export const cars = [
  {
    slug: '2021-bmw-320i',
    title: '2021 BMW 320i',
    brand: 'BMW',
    model: '320i',
    year: 2021,
    color: null,
    price: null,
    mileage: null,
    description: null,
    photos: ['/demo-1.jpg', '/demo-3.jpg', '/hero.jpg'],
    createdAt: '2026-09-30',
  },
  {
    slug: '2022-toyota-rav4',
    title: '2022 Toyota RAV4',
    brand: 'Toyota',
    model: 'RAV4',
    year: 2022,
    color: '白',
    price: 98,
    mileage: null,
    description: null,
    photos: ['/hero-wide.jpg', '/demo-2.jpg'],
    createdAt: '2026-09-28',
  },
  {
    slug: '2020-lexus-es200',
    title: '2020 Lexus ES200',
    brand: 'Lexus',
    model: 'ES200',
    year: 2020,
    color: '灰',
    price: null,
    mileage: null,
    description: '歡迎預約到店看車。',
    photos: ['/hero.jpg', '/demo-2.jpg', '/demo-3.jpg'],
    createdAt: '2026-09-25',
  },
];

export function publishedCars() {
  return [...cars].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCar(slug) {
  return cars.find((c) => c.slug === slug) || null;
}

export function formatPrice(price) {
  return price ? `${price} 萬` : '歡迎洽詢';
}
