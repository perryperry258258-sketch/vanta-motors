import { SITE_URL } from '../lib/i18n';

// 公開頁面讓搜尋引擎收錄；後台、合作夥伴頁、成交確認、API 不收錄
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/partner', '/confirm', '/api'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
