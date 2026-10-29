import { SITE } from '../lib/site.js';

export default function robots() {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/checkout', '/order', '/account', '/api/', '/track', '/wishlist', '/unsubscribe'],
    }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
