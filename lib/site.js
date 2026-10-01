export const site = {
  name: 'VANTA MOTORS',
  tagline: '精選車輛・安心選擇',
  phone: '0919481060',
  phoneDisplay: '0919-481-060',
  lineId: 'perry258',
  lineUrl: 'https://line.me/ti/p/~perry258',
};

export function formatPrice(price, priceMax) {
  if (price && priceMax && priceMax !== price) return `${price}～${priceMax} 萬`;
  if (price || priceMax) return `${price || priceMax} 萬`;
  return '歡迎洽詢';
}
