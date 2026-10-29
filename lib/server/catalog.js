// Catalogue reads, cached in Next's data cache and tagged so the admin can
// revalidate them on demand (revalidateTag('catalog', ...)). The time-based
// fallback keeps data fresh even if an on-demand revalidation is ever missed.
import { unstable_cache } from 'next/cache';
import { supabasePublic } from './supabase.js';
import { PAGE_SIZE } from '../site.js';

const CATALOG = { tags: ['catalog'], revalidate: 600 };

const CARD_COLUMNS =
  'id, slug, title, price, compare_at_price, in_stock, is_sample, category_slug, category_name, image_key, image_widths, image_width, image_height, image_alt, created_at, sold_count';

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const getSettings = unstable_cache(
  async () => must(await supabasePublic().rpc('get_public_settings')),
  ['settings'],
  { tags: ['settings'], revalidate: 60 },
);

export const getCategories = unstable_cache(
  async () => must(await supabasePublic().from('categories')
    .select('id, name, slug, description, is_featured, sort_order').order('sort_order')),
  ['categories'],
  CATALOG,
);

export const getDeliveryZones = unstable_cache(
  async () => must(await supabasePublic().rpc('get_delivery_zones')),
  ['delivery-zones'],
  { tags: ['settings'], revalidate: 600 },
);

export const getBanners = unstable_cache(
  async () => must(await supabasePublic().from('banners').select('*').order('sort_order')),
  ['banners'],
  CATALOG,
);

export const SORTS = {
  new: { label: 'Newest', column: 'created_at', ascending: false },
  'price-asc': { label: 'Price: low to high', column: 'price', ascending: true },
  'price-desc': { label: 'Price: high to low', column: 'price', ascending: false },
  popular: { label: 'Most popular', column: 'sold_count', ascending: false },
};

// Normalises raw search params into a stable, cacheable filter object.
export function parseFilters(params = {}) {
  const num = (v) => {
    const n = Number.parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const q = String(params.q ?? '').trim().slice(0, 80);
  return {
    q,
    category: /^[a-z0-9-]{1,60}$/.test(params.category ?? '') ? params.category : '',
    min: num(params.min),
    max: num(params.max),
    sort: SORTS[params.sort] ? params.sort : 'new',
  };
}

async function queryProducts(filters, offset, limit) {
  const sort = SORTS[filters.sort];
  let query = supabasePublic().from('product_cards').select(CARD_COLUMNS);
  if (filters.category) query = query.eq('category_slug', filters.category);
  if (filters.min != null) query = query.gte('price', filters.min);
  if (filters.max != null) query = query.lte('price', filters.max);
  // Every word must match somewhere in title, category or tags.
  for (const word of filters.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
    query = query.ilike('search_text', `%${word.replace(/[%_\\,()]/g, '')}%`);
  }
  query = query.order(sort.column, { ascending: sort.ascending }).order('id');
  const rows = must(await query.range(offset, offset + limit)); // one extra row tells us if there is more
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export const getProducts = unstable_cache(
  async (filters, offset = 0, limit = PAGE_SIZE) => queryProducts(filters, offset, limit),
  ['products'],
  CATALOG,
);

export const getNewArrivals = unstable_cache(
  async (limit = 8) => must(await supabasePublic().from('product_cards').select(CARD_COLUMNS)
    .order('created_at', { ascending: false }).limit(limit)),
  ['new-arrivals'],
  CATALOG,
);

// Only products that have actually sold. Empty until real orders are confirmed.
export const getBestSellers = unstable_cache(
  async (limit = 8) => must(await supabasePublic().from('product_cards').select(CARD_COLUMNS)
    .gt('sold_count', 0).order('sold_count', { ascending: false }).limit(limit)),
  ['best-sellers'],
  CATALOG,
);

export const getProductsByIds = unstable_cache(
  async (ids) => ids.length
    ? must(await supabasePublic().from('product_cards').select(CARD_COLUMNS).in('id', ids))
    : [],
  ['products-by-ids'],
  CATALOG,
);

export const getProduct = unstable_cache(
  async (slug) => {
    const rows = must(await supabasePublic().from('products')
      .select(`id, slug, title, price, compare_at_price, stock, tags, description_html, seo_title,
        seo_description, is_sample, updated_at,
        category:categories(name, slug),
        variants:product_variants(id, name, color_hex, stock, sort_order),
        images:product_images(id, storage_key, widths, width, height, alt, sort_order, variant_id)`)
      .eq('slug', slug).limit(1));
    const p = rows[0];
    if (!p) return null;
    p.variants.sort((a, b) => a.sort_order - b.sort_order);
    p.images.sort((a, b) => a.sort_order - b.sort_order);
    p.in_stock = p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0;
    return p;
  },
  ['product'],
  CATALOG,
);

export const getRelated = unstable_cache(
  async (productId, categorySlug, limit = 4) => {
    let query = supabasePublic().from('product_cards').select(CARD_COLUMNS).neq('id', productId);
    if (categorySlug) query = query.eq('category_slug', categorySlug);
    let rows = must(await query.order('created_at', { ascending: false }).limit(limit));
    if (rows.length < limit) {
      const more = must(await supabasePublic().from('product_cards').select(CARD_COLUMNS)
        .neq('id', productId).order('created_at', { ascending: false }).limit(limit * 2));
      const seen = new Set(rows.map((r) => r.id));
      rows = rows.concat(more.filter((r) => !seen.has(r.id))).slice(0, limit);
    }
    return rows;
  },
  ['related'],
  CATALOG,
);

export const getSitemapEntries = unstable_cache(
  async () => {
    const products = must(await supabasePublic().from('products').select('slug, updated_at'));
    const categories = must(await supabasePublic().from('categories').select('slug, updated_at'));
    return { products, categories };
  },
  ['sitemap'],
  CATALOG,
);
