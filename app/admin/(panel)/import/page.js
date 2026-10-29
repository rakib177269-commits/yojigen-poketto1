import Link from 'next/link';
import { requireStaff } from '../../../../lib/server/auth.js';
import ImportForm from '../../../../components/admin/ImportForm.js';
import PhotoMatcher from '../../../../components/admin/PhotoMatcher.js';

export const metadata = { title: 'Import products' };

export default async function ImportPage() {
  const staff = await requireStaff(['admin', 'manager']);
  const { data: waiting } = await staff.supabase.from('products').select('id, title, import_photo_files')
    .neq('import_photo_files', '{}').order('created_at');
  return (
    <>
      <h1 className="admin-h1">Import products</h1>
      <section className="panel">
        <h2>1. Upload the spreadsheet</h2>
        <p className="hint">Use the <a href="https://github.com/rakib177269-commits/yojigen-poketto1/raw/main/docs/product-upload-template.xlsx">product upload template</a>.
          The file is checked first; nothing is imported until you confirm, and if any row has a problem nothing is imported at all.</p>
        <ImportForm />
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>2. Upload the photos</h2>
        {(waiting ?? []).length === 0 ? <p className="hint">No products are waiting for photos.</p> : (
          <>
            <p className="hint">Select all the photos at once. Each file is matched by name to the product that listed it.</p>
            <ul className="plain-list">
              {waiting.map((p) => <li key={p.id}><Link href={`/admin/products/${p.id}`}>{p.title}</Link>: <span className="hint">{p.import_photo_files.join(', ')}</span></li>)}
            </ul>
            <PhotoMatcher waiting={waiting} />
          </>
        )}
      </section>
    </>
  );
}
