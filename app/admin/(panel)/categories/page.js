import { requireStaff } from '../../../../lib/server/auth.js';
import { saveCategory, deleteCategory } from '../../../../lib/admin/catalog-actions.js';
import ActionForm from '../../../../components/admin/ActionForm.js';
import ActionButton from '../../../../components/admin/ActionButton.js';

export const metadata = { title: 'Categories' };

function CategoryFields({ c = {} }) {
  return (
    <>
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div className="form-2">
        <div className="field"><label htmlFor={`n-${c.id ?? 'new'}`}>Name</label><input id={`n-${c.id ?? 'new'}`} name="name" className="input" defaultValue={c.name} required /></div>
        <div className="field"><label htmlFor={`s-${c.id ?? 'new'}`}>Web address</label><input id={`s-${c.id ?? 'new'}`} name="slug" className="input" defaultValue={c.slug} placeholder="made from the name" /></div>
      </div>
      <div className="field"><label htmlFor={`d-${c.id ?? 'new'}`}>Short description</label><input id={`d-${c.id ?? 'new'}`} name="description" className="input" defaultValue={c.description ?? ''} /></div>
      <div className="row-gap">
        <label className="check"><input type="checkbox" name="is_active" defaultChecked={c.is_active ?? true} /> Visible</label>
        <label className="check"><input type="checkbox" name="is_featured" defaultChecked={c.is_featured ?? false} /> Show on home page</label>
        <label className="check">Order <input name="sort_order" className="input input-sm" style={{ width: 70 }} inputMode="numeric" defaultValue={c.sort_order ?? 0} aria-label="Order" /></label>
      </div>
    </>
  );
}

export default async function CategoriesPage() {
  const staff = await requireStaff(['admin', 'manager']);
  const { data: cats } = await staff.supabase.from('categories').select('*, products(count)').order('sort_order');
  return (
    <>
      <h1 className="admin-h1">Categories</h1>
      <details className="panel" style={{ marginBottom: 16 }}>
        <summary><strong>+ New category</strong></summary>
        <div style={{ marginTop: 12 }}><ActionForm action={saveCategory} submitLabel="Create category" resetOnSuccess><CategoryFields /></ActionForm></div>
      </details>
      {(cats ?? []).map((c) => (
        <details key={c.id} className="panel" style={{ marginBottom: 10 }}>
          <summary><strong>{c.name}</strong> <span className="hint">/shop/{c.slug} · {c.products?.[0]?.count ?? 0} products{c.is_active ? '' : ' · hidden'}{c.is_featured ? ' · on home page' : ''}</span></summary>
          <div style={{ marginTop: 12 }}>
            <ActionForm action={saveCategory} submitLabel="Save"><CategoryFields c={c} /></ActionForm>
            <div style={{ marginTop: 10 }}>
              <ActionButton action={deleteCategory.bind(null, c.id)} className="btn btn-ghost btn-sm"
                confirm={`Delete "${c.name}"? Its products stay but become uncategorised.`}>Delete category</ActionButton>
            </div>
          </div>
        </details>
      ))}
    </>
  );
}
