import { requireStaff } from '../../../../lib/server/auth.js';
import { updateSettings, updateZone } from '../../../../lib/admin/actions.js';
import { saveCourierSettings } from '../../../../lib/admin/courier-actions.js';
import { pathaoEnvStatus } from '../../../../lib/server/pathao.js';
import { tokenStatus } from '../../../../lib/server/marketing.js';
import { saveTrackingSettings } from '../../../../lib/admin/marketing-actions.js';
import { saveNotificationSettings, sendTestEmail, sendTestSms } from '../../../../lib/admin/notify-actions.js';
import { notifyStatus } from '../../../../lib/server/notify.js';
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
      <MarketingSettings ids={settings.integrations?.tracking ?? {}} />
      <MessageSettings cfg={settings.integrations?.notifications ?? null} />

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

function MarketingSettings({ ids }) {
  const t = tokenStatus();
  return (
    <section className="panel form-grid" style={{ marginTop: 16 }}>
      <h2>Marketing (Facebook &amp; Google)</h2>
      <p className="hint" style={{ margin: 0 }}>
        Tags load on shop pages only, never in admin. Purchases are reported by our server only after you confirm an order,
        so fake and rejected orders never reach your ad accounts.
      </p>
      <ActionForm action={saveTrackingSettings} submitLabel="Save marketing ids">
        <div className="form-2">
          <div className="field"><label htmlFor="mk-meta">Meta Pixel ID</label>
            <input id="mk-meta" name="meta_pixel_id" className="input" inputMode="numeric" defaultValue={ids.meta_pixel_id ?? ''} placeholder="e.g. 123456789012345" /></div>
          <div className="field"><label htmlFor="mk-ga4">Google Analytics 4 Measurement ID</label>
            <input id="mk-ga4" name="ga4_id" className="input" defaultValue={ids.ga4_id ?? ''} placeholder="G-XXXXXXXXXX" /></div>
        </div>
      </ActionForm>
      <p className="hint" style={{ margin: 0 }}>
        Server keys in Netlify: Meta Conversions API token <Mark ok={t.meta} />, GA4 API secret <Mark ok={t.ga4} />.
        Without them the browser tags still work, but purchases can’t be reported.
        {t.metaTest && <strong> Meta TEST mode is on (META_TEST_EVENT_CODE): events go to Test Events only. Remove it when done.</strong>}
      </p>
    </section>
  );
}

const EVENTS = [['placed', 'Order received'], ['confirmed', 'Confirmed'], ['dispatched', 'Sent with courier'],
  ['delivered', 'Delivered'], ['cancelled', 'Cancelled (not for rejected/fake orders)']];
// Same defaults as the database (private.notify_wanted) when nothing is saved yet.
const DEFAULTS = { sms: ['confirmed', 'dispatched'], email: ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'] };

function MessageSettings({ cfg }) {
  const st = notifyStatus();
  const on = (channel, k) => (cfg?.[channel]?.[k] ?? DEFAULTS[channel].includes(k));
  return (
    <section className="panel form-grid" style={{ marginTop: 16 }}>
      <h2>Customer messages (SMS &amp; email)</h2>
      <p className="hint" style={{ margin: 0 }}>
        SMS provider <Mark ok={st.sms} />{st.smsProvider ? ` (${st.smsProvider})` : ''}, email sender <Mark ok={st.email} />.
        Messages are sent right away and retried for a while if a provider is down. Without a provider, messages are skipped (never sent late).
      </p>
      <ActionForm action={saveNotificationSettings} submitLabel="Save message settings">
        <table className="table">
          <thead><tr><th>When</th><th>SMS (costs per message)</th><th>Email (if the customer gave one)</th></tr></thead>
          <tbody>
            {EVENTS.map(([k, label]) => (
              <tr key={k}><td>{label}</td>
                <td><input type="checkbox" name={`sms_${k}`} defaultChecked={on('sms', k)} aria-label={`SMS: ${label}`} className="check-box" /></td>
                <td><input type="checkbox" name={`email_${k}`} defaultChecked={on('email', k)} aria-label={`Email: ${label}`} className="check-box" /></td></tr>
            ))}
          </tbody>
        </table>
        <div className="field" style={{ maxWidth: 360 }}><label htmlFor="ms-staff">Email me every new order at</label>
          <input id="ms-staff" name="staff_email" type="email" className="input" defaultValue={cfg?.staff_email ?? ''} placeholder="you@example.com" /></div>
      </ActionForm>
      <div className="form-2">
        {st.sms && (
          <ActionForm action={sendTestSms} submitLabel="Send test SMS" submitClass="btn btn-ghost btn-sm">
            <div className="field"><label htmlFor="ts-phone">Test SMS to</label><input id="ts-phone" name="phone" className="input" inputMode="tel" placeholder="01XXXXXXXXX" /></div>
          </ActionForm>
        )}
        {st.email && (
          <ActionForm action={sendTestEmail} submitLabel="Send test email" submitClass="btn btn-ghost btn-sm">
            <div className="field"><label htmlFor="ts-email">Test email to</label><input id="ts-email" name="email" type="email" className="input" /></div>
          </ActionForm>
        )}
      </div>
    </section>
  );
}
