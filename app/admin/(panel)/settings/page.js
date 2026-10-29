import { requireStaff } from '../../../../lib/server/auth.js';
import { updateSettings, updateZone } from '../../../../lib/admin/actions.js';
import { saveCourierSettings } from '../../../../lib/admin/courier-actions.js';
import { pathaoEnvStatus } from '../../../../lib/server/pathao.js';
import { SITE } from '../../../../lib/site.js';
import PathaoTest from '../../../../components/admin/PathaoTest.js';
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

      <PathaoSettings cfg={settings.integrations?.pathao ?? {}} />

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

const Mark = ({ ok }) => <strong className={ok ? 'ok-text' : 'error-text'}>{ok ? 'set' : 'missing'}</strong>;

function PathaoSettings({ cfg }) {
  const env = pathaoEnvStatus();
  return (
    <section className="panel form-grid" style={{ marginTop: 16 }}>
      <h2>Pathao courier</h2>
      <p className="hint" style={{ margin: 0 }}>
        The secret keys live in Netlify (never here): API keys <Mark ok={env.client} />, merchant login <Mark ok={env.login} />{' '}
        (only needed for older accounts), webhook secret <Mark ok={env.webhook} />.
        {env.sandbox && <strong> Using Pathao’s TEST (sandbox) server.</strong>}
      </p>
      {env.client && <PathaoTest />}
      <ActionForm action={saveCourierSettings} submitLabel="Save Pathao settings">
        <div className="form-2">
          <div className="field"><label htmlFor="pa-store">Pathao store ID</label>
            <input id="pa-store" name="store_id" className="input" inputMode="numeric" defaultValue={cfg.store_id ?? ''} placeholder="from “Test connection”" /></div>
          <div className="field"><label htmlFor="pa-w">Usual parcel weight (kg)</label>
            <input id="pa-w" name="default_weight" className="input" inputMode="decimal" defaultValue={cfg.default_weight ?? 0.5} /></div>
        </div>
        <div className="field"><label htmlFor="pa-i">Note on every parcel (optional)</label>
          <input id="pa-i" name="instruction" className="input" maxLength={200} defaultValue={cfg.instruction ?? ''} placeholder="e.g. Fragile, handle with care" /></div>
      </ActionForm>
      <details>
        <summary><strong>Status updates from Pathao (webhook)</strong></summary>
        <ol className="result-list" style={{ marginTop: 8 }}>
          <li>Pathao merchant panel → <strong>Developer API</strong> → <strong>Webhook</strong>.</li>
          <li>Callback URL: <code>{SITE.url}/api/webhooks/pathao</code></li>
          <li>Secret: the same value you saved as <code>PATHAO_WEBHOOK_SECRET</code> in Netlify.</li>
          <li>Tick all order events, save, then press Pathao’s verify / test button.</li>
        </ol>
        <p className="hint">Pickups, “out for delivery”, delivered and returned then update orders by themselves, and customers see the progress on the tracking page.</p>
      </details>
    </section>
  );
}
