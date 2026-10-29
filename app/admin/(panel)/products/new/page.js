import { requireStaff } from '../../../../../lib/server/auth.js';
import ProductForm from '../../../../../components/admin/ProductForm.js';

export const metadata = { title: 'Add product' };

export default async function NewProductPage() {
  const staff = await requireStaff(['admin', 'manager']);
  const { data: categories } = await staff.supabase.from('categories').select('id, name').order('sort_order');
  return (
    <>
      <h1 className="admin-h1">Add product</h1>
      <ProductForm categories={categories ?? []} />
    </>
  );
}
