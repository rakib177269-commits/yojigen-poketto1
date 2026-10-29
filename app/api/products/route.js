// Next page of products for infinite scroll, or specific ids for the wishlist.
import { getProducts, getProductsByIds, parseFilters } from '../../../lib/server/catalog.js';
import { PAGE_SIZE } from '../../../lib/site.js';

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  try {
    if (params.ids) {
      const ids = params.ids.split(',').filter((id) => UUID.test(id)).slice(0, 100).sort();
      return Response.json({ items: await getProductsByIds(ids) });
    }
    const offset = Math.min(Math.max(Number.parseInt(params.offset, 10) || 0, 0), 2000);
    const page = await getProducts(parseFilters(params), offset, PAGE_SIZE);
    return Response.json(page, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    console.error('products api:', err.message);
    return Response.json({ items: [], hasMore: false, error: 'server_error' }, { status: 500 });
  }
}
