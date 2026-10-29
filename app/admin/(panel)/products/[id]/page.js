import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '../../../../../lib/server/auth.js';
import ProductForm from '../../../../../components/admin/ProductForm.js';

export const metadata = { title: 'Edit product' };

export default async function EditProductPage({ params, searchParams }) {
  const staff = await requireStaff(['admin', 'manager']);
  const { id } = await params;
  const { saved } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: product }, { data: categories }] = await Promise.all([
    staff.supabase.from('products').select('*, variants:product_variants(*), images:product_images(*)').eq('id', id).maybeSingle(),
    staff.supabase.from('categories').select('id, name').order('sort_order'),
  ]);
  if (!product) notFound();
  return (
    <>
      <Link href="/admin/products" className="hint">← Products</Link>
      <h1 className="admin-h1">{product.title} <span className={`status status-${product.status}`}>{product.status}</span></h1>
      {saved && <div className="notice" style={{ marginBottom: 12 }}>Product created.</div>}
      {product.import_photo_files.length > 0 && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Waiting for photos from the spreadsheet: {product.import_photo_files.join(', ')}. Upload them below or on the <Link href="/admin/import">Import</Link> page.
        </div>
      )}
      <ProductForm product={product} categories={categories ?? []} canDelete />
    </>
  );
}
