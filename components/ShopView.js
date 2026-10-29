import Link from 'next/link';
import ProductGrid from './ProductGrid.js';
import { getCategories, getProducts, parseFilters, SORTS } from '../lib/server/catalog.js';
import { SearchTracker } from './TrackEvents.js';

export default async function ShopView({ searchParams, categorySlug }) {
  const filters = parseFilters({ ...searchParams, category: categorySlug ?? searchParams.category });
  const [categories, page] = await Promise.all([getCategories(), getProducts(filters, 0)]);
  const category = categories.find((c) => c.slug === filters.category);
  const query = Object.fromEntries(Object.entries({
    q: filters.q, category: filters.category, min: filters.min ?? '', max: filters.max ?? '', sort: filters.sort,
  }).filter(([, v]) => v !== '' && v != null));
  const action = category ? `/shop/${category.slug}` : '/shop';

  return (
    <div className="container">
      <div className="shop-head">
        <span className="eyebrow">{category ? 'Category' : 'Shop'}</span>
        <h1>{filters.q ? `Results for “${filters.q}”` : category ? category.name : 'All products'}</h1>
        {category?.description && <p style={{ color: 'var(--ink-2)', marginTop: 8 }}>{category.description}</p>}
      </div>

      <nav className="chips" aria-label="Categories">
        <Link className="chip" href="/shop" aria-current={!category ? 'page' : undefined}>All</Link>
        {categories.map((c) => (
          <Link key={c.slug} className="chip" href={`/shop/${c.slug}`} aria-current={category?.slug === c.slug ? 'page' : undefined}>{c.name}</Link>
        ))}
      </nav>

      {/* A plain GET form: filtering works even before JavaScript loads. */}
      <form className="filters" action={action} method="get" role="search">
        <div className="field search">
          <label htmlFor="search">Search</label>
          <input id="search" name="q" type="search" className="input" defaultValue={filters.q} placeholder="Search products, categories, tags" enterKeyHint="search" />
        </div>
        <div className="field">
          <label htmlFor="min">Min price (৳)</label>
          <input id="min" name="min" inputMode="numeric" className="input" defaultValue={filters.min ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="max">Max price (৳)</label>
          <input id="max" name="max" inputMode="numeric" className="input" defaultValue={filters.max ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" className="select" defaultValue={filters.sort}>
            {Object.entries(SORTS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">Apply</button>
      </form>

      {filters.q && <SearchTracker query={filters.q} />}

      {page.items.length === 0 ? (
        <div className="empty">
          <p>No products match{filters.q ? ` “${filters.q}”` : ''}.</p>
          <Link href="/shop" className="btn btn-ghost">Clear filters</Link>
        </div>
      ) : (
        <ProductGrid key={JSON.stringify(query)} initialItems={page.items} initialHasMore={page.hasMore} query={query} />
      )}
      <div style={{ height: 48 }} />
    </div>
  );
}
