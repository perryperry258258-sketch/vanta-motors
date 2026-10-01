export const site = {
  name: 'VANTA MOTORS',
  tagline: '精選車輛・安心選擇',
  phone: '0919481060',
  phoneDisplay: '0919-481-060',
  lineId: 'perry258',
  lineUrl: 'https://line.me/ti/p/~perry258',
};

export function formatPrice(price) {
  return price ? `${price} 萬` : '歡迎洽詢';
}
