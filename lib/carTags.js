// 車輛標籤：只用客觀條件（里程、上架時間），不比較價格
const LABEL = {
  zh: { lowkm: '低里程', new: '新到車' },
  en: { lowkm: 'Low Mileage', new: 'New Arrival' },
};

// 台灣時間的今年
export const currentYear = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(new Date()));

// 低里程：平均每年不到 1 萬公里（當年度的車以 1 年計）
export const KM_PER_YEAR = 10000;
export const NEW_DAYS = 7;

export function isLowMileage(car, year = currentYear()) {
  if (!car || !car.year || !car.mileage) return false;
  const age = Math.max(1, year - Number(car.year));
  return Number(car.mileage) <= age * KM_PER_YEAR;
}

export function isNewArrival(car, now = Date.now()) {
  return !!(car && car.created_at && now - new Date(car.created_at).getTime() <= NEW_DAYS * 864e5);
}

export function carTags(car, lang = 'zh') {
  const L = LABEL[lang] || LABEL.zh;
  const tags = [];
  if (isNewArrival(car)) tags.push(['new', L.new]);
  if (isLowMileage(car)) tags.push(['lowkm', L.lowkm]);
  return tags;
}

// 資料庫篩選用：每個年份各自的里程上限，例如 2024 年 ≤ 2 萬、2020 年 ≤ 6 萬
export function lowMileageFilter(year = currentYear()) {
  const parts = [];
  for (let y = year; y >= year - 35; y--) {
    parts.push(`and(year.eq.${y},mileage.gt.0,mileage.lte.${Math.max(1, year - y) * KM_PER_YEAR})`);
  }
  return parts.join(',');
}
