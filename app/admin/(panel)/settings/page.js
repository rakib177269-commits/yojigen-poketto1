import { requireStaff } from '../../../../lib/server/auth.js';
import { updateSettings, updateZone } from '../../../../lib/admin/actions.js';
import ActionForm from '../../../../components/admin/ActionForm.js';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const staff = await requireStaff(['admin']);
  const [{ data: settings }, { data: zones }] = await Promise.all([
    staff.supabase.from('store_settings').select('*').eq('id', 1).single(),
    staff.supabase.from('delivery_zones').select('*').order('match_priority'),
  ]);

  return (
    <>
      <h1 className="admin-h1">Settings</h1>
      <section className="panel">
        <h2>Shop</h2>
        <ActionForm action={updateSettings} submitLabel="Save">
          <label className="check">
            <input type="checkbox" name="maintenance_mode" defaultChecked={settings.maintenance_mode} />
            <span><strong>Maintenance mode</strong>: visitors see a “back soon” page; signed-in staff still see the shop.</span>
          </label>
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="threshold">Free delivery from (৳)</label>
            <input id="threshold" name="free_shipping_threshold" inputMode="numeric" className="input" defaultValue={settings.free_shipping_threshold ?? ''} placeholder="Empty = no free delivery" />
          </div>
        </ActionForm>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Delivery zones</h2>
        <p className="hint">Addresses are matched against the keywords, English or Bangla, top zone first. Outskirts come before the city so “সাভার, ঢাকা” is outskirts.</p>
        {zones.map((z) => (
          <details key={z.code} className="zone">
            <summary><strong>{z.name}</strong> · ৳{z.fee} · {z.eta_text}{z.is_default ? ' · used when nothing matches' : ''}</summary>
            <ActionForm action={updateZone.bind(null, z.code)} submitLabel="Save zone">
              <div className="form-2">
                <div className="field"><label htmlFor={`fee-${z.code}`}>Fee (৳)</label><input id={`fee-${z.code}`} name="fee" inputMode="numeric" className="input" defaultValue={z.fee} /></div>
                <div className="field"><label htmlFor={`eta-${z.code}`}>Delivery time</label><input id={`eta-${z.code}`} name="eta" className="input" defaultValue={z.eta_text ?? ''} /></div>
              </div>
              <div className="field"><label htmlFor={`kw-${z.code}`}>Keywords (comma separated)</label>
                <textarea id={`kw-${z.code}`} name="keywords" className="textarea" rows={5} defaultValue={z.keywords.join(', ')} /></div>
            </ActionForm>
          </details>
        ))}
      </section>
    </>
  );
}
