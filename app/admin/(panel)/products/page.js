import Link from 'next/link';
import { requireStaff } from '../../../../lib/server/auth.js';
import BulkBar from '../../../../components/admin/BulkBar.js';
import ActionButton from '../../../../components/admin/ActionButton.js';
import { removeSampleProducts } from '../../../../lib/admin/catalog-actions.js';
import { formatTaka } from '../../../../components/admin/ui.js';
import { defaultImageUrl } from '../../../../lib/images.js';

export const metadata = { title: 'Products' };
const STATUS = ['active', 'draft', 'hidden', 'archived'];

export default async function ProductsPage({ searchParams }) {
  const staff = await requireStaff(['admin', 'manager']);
  const { status = '', q = '', deleted, photos } = await searchParams;
  let query = staff.supabase.from('products')
    .select('id, title, slug, status, price, compare_at_price, stock, is_sample, import_photo_files, category:categories(name), variants:product_variants(stock, is_active), images:product_images(storage_key, widths, sort_order)')
    .order('created_at', { ascending: false }).limit(300);
  if (STATUS.includes(status)) query = query.eq('status', status);
  if (q) query = query.ilike('title', `%${String(q).replace(/[%_,()]/g, '').slice(0, 60)}%`);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const products = photos === 'missing' ? rows.filter((p) => !p.images.length) : rows;

  return (
    <>
      <div className="admin-head">
        <h1 className="admin-h1">Products</h1>
        <div className="row-gap">
          <Link href="/admin/import" className="btn btn-ghost btn-sm">Import spreadsheet</Link>
          <Link href="/admin/products/new" className="btn btn-primary btn-sm">Add product</Link>
        </div>
      </div>
      {deleted && <div className="notice" style={{ marginBottom: 12 }}>Product deleted.</div>}
      {staff.role === 'admin' && rows.some((p) => p.is_sample) && (
        <div className="notice row-gap" style={{ marginBottom: 12 }}>
          <span>{rows.filter((p) => p.is_sample).length} sample products are still in the shop. Remove them before launch, once your real products are in.</span>
          <ActionButton action={removeSampleProducts} className="btn btn-ghost btn-sm"
            confirm="Delete ALL sample products now? This cannot be undone. Past orders keep their item names.">Remove sample products</ActionButton>
        </div>
      )}
      <nav className="chips">
        <Link className="chip" href="/admin/products" aria-current={!status && !photos ? 'page' : undefined}>All</Link>
        {STATUS.map((s) => <Link key={s} className="chip" href={`/admin/products?status=${s}`} aria-current={status === s ? 'page' : undefined}>{s[0].toUpperCase() + s.slice(1)}</Link>)}
        <Link className="chip" href="/admin/products?photos=missing" aria-current={photos === 'missing' ? 'page' : undefined}>No photo</Link>
      </nav>
      <form className="row-gap" style={{ marginBottom: 12 }} role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="pq" className="sr-only">Search products</label>
        <input id="pq" name="q" className="input" defaultValue={q} placeholder="Search by title" style={{ maxWidth: 320 }} />
        <button className="btn btn-ghost btn-sm">Search</button>
      </form>

      <BulkBar formId="bulk" />
      {products.length === 0 ? <p className="empty">No products here.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th><span className="sr-only">Select</span></th><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead>
            <tbody>
              {products.map((p) => {
                const img = [...p.images].sort((a, b) => a.sort_order - b.sort_order)[0];
                const active = p.variants.filter((v) => v.is_active);
                const stock = active.length ? active.reduce((n, v) => n + v.stock, 0) : p.stock;
                return (
                  <tr key={p.id}>
                    <td><input type="checkbox" name="ids" value={p.id} form="bulk" aria-label={`Select ${p.title}`} className="check-box" /></td>
                    <td>{img ? <img src={defaultImageUrl(img.storage_key, img.widths, 400)} alt="" className="list-thumb" /> : <span className="list-thumb empty-thumb">no photo</span>}</td>
                    <td><Link href={`/admin/products/${p.id}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                      <div className="hint">{p.category?.name ?? 'No category'}{active.length ? ` · ${active.length} colour${active.length === 1 ? "" : "s"}` : ''}{p.is_sample ? ' · sample' : ''}
                        {p.import_photo_files.length > 0 && ` · waiting for ${p.import_photo_files.length} photo(s)`}</div></td>
                    <td className="nowrap">{formatTaka(p.price)}{p.compare_at_price ? <div className="hint"><s>{formatTaka(p.compare_at_price)}</s></div> : null}</td>
                    <td className={stock === 0 ? 'error-text' : ''}>{stock}</td>
                    <td><span className={`status status-${p.status}`}>{p.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
