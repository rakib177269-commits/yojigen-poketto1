import { requireStaff } from '../../../../lib/server/auth.js';
import { deleteBanner } from '../../../../lib/admin/catalog-actions.js';
import BannerForm from '../../../../components/admin/BannerForm.js';
import ActionButton from '../../../../components/admin/ActionButton.js';

export const metadata = { title: 'Banners' };

export default async function BannersPage() {
  const staff = await requireStaff(['admin', 'manager']);
  const { data: banners } = await staff.supabase.from('banners').select('*').order('sort_order');
  return (
    <>
      <h1 className="admin-h1">Home page banners</h1>
      <p className="hint">The first live banner replaces the text hero at the top of the home page.</p>
      <details className="panel" style={{ marginBottom: 16 }}>
        <summary><strong>+ New banner</strong></summary>
        <div style={{ marginTop: 12 }}><BannerForm /></div>
      </details>
      {(banners ?? []).map((b) => (
        <details key={b.id} className="panel" style={{ marginBottom: 10 }}>
          <summary><strong>{b.title || 'Untitled banner'}</strong> <span className="hint">· {b.is_active ? 'live' : 'off'}</span></summary>
          <div style={{ marginTop: 12 }}>
            <BannerForm banner={b} />
            <div style={{ marginTop: 10 }}><ActionButton action={deleteBanner.bind(null, b.id)} className="btn btn-ghost btn-sm" confirm="Delete this banner?">Delete banner</ActionButton></div>
          </div>
        </details>
      ))}
    </>
  );
}
