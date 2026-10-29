// Built per request from the cached catalogue, so new products appear without a redeploy.
export const dynamic = 'force-dynamic';

import { getSitemapEntries } from '../lib/server/catalog.js';
import { SITE } from '../lib/site.js';

export default async function sitemap() {
  const { products, categories } = await getSitemapEntries();
  const page = (path, priority = 0.5) => ({ url: `${SITE.url}${path}`, changeFrequency: 'weekly', priority });
  return [
    page('/', 1),
    page('/shop', 0.9),
    ...categories.map((c) => ({ ...page(`/shop/${c.slug}`, 0.8), lastModified: c.updated_at })),
    ...products.map((p) => ({ ...page(`/p/${p.slug}`, 0.7), lastModified: p.updated_at })),
    ...['/about', '/shipping', '/returns', '/privacy', '/terms'].map((p) => page(p, 0.3)),
  ];
}
