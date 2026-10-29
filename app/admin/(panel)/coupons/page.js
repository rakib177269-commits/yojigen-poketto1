import { requireStaff } from '../../../../lib/server/auth.js';
import { saveCoupon, deleteCoupon } from '../../../../lib/admin/catalog-actions.js';
import ActionForm from '../../../../components/admin/ActionForm.js';
import ActionButton from '../../../../components/admin/ActionButton.js';
import { formatDate, formatTaka } from '../../../../components/admin/ui.js';

export const metadata = { title: 'Coupons' };

// timestamptz -> value for <input type="datetime-local"> in Dhaka time
const local = (iso) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 16) : '');

function CouponFields({ c = {} }) {
  const k = c.id ?? 'new';
  return (
    <>
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div className="form-2">
        <div className="field"><label htmlFor={`code-${k}`}>Code</label><input id={`code-${k}`} name="code" className="input" defaultValue={c.code} required style={{ textTransform: 'uppercase' }} /></div>
        <div className="field"><label htmlFor={`type-${k}`}>Type</label>
          <select id={`type-${k}`} name="type" className="select" defaultValue={c.type ?? 'percent'}>
            <option value="percent">Percent off items</option><option value="fixed">Fixed taka off items</option><option value="free_shipping">Free delivery</option>
          </select></div>
      </div>
      <div className="form-2">
        <div className="field"><label htmlFor={`val-${k}`}>Amount (% or ৳; ignored for free delivery)</label><input id={`val-${k}`} name="value" className="input" inputMode="numeric" defaultValue={c.value ?? ''} /></div>
        <div className="field"><label htmlFor={`max-${k}`}>Max discount ৳ (percent coupons, optional)</label><input id={`max-${k}`} name="max_discount" className="input" inputMode="numeric" defaultValue={c.max_discount ?? ''} /></div>
      </div>
      <div className="form-2">
        <div className="field"><label htmlFor={`min-${k}`}>Minimum order ৳</label><input id={`min-${k}`} name="min_order" className="input" inputMode="numeric" defaultValue={c.min_order ?? 0} /></div>
        <div className="field"><label htmlFor={`lim-${k}`}>Usage limit (empty = unlimited)</label><input id={`lim-${k}`} name="usage_limit" className="input" inputMode="numeric" defaultValue={c.usage_limit ?? ''} /></div>
      </div>
      <div className="form-2">
        <div className="field"><label htmlFor={`st-${k}`}>Starts (Dhaka time, optional)</label><input id={`st-${k}`} name="starts_at" type="datetime-local" className="input" defaultValue={local(c.starts_at)} /></div>
        <div className="field"><label htmlFor={`ex-${k}`}>Expires (Dhaka time, optional)</label><input id={`ex-${k}`} name="expires_at" type="datetime-local" className="input" defaultValue={local(c.expires_at)} /></div>
      </div>
      <label className="check"><input type="checkbox" name="is_active" defaultChecked={c.is_active ?? true} /> Active</label>
      <p className="hint">A free-delivery coupon only removes the delivery fee; product sale prices stay as they are.</p>
    </>
  );
}

const describe = (c) => (c.type === 'percent' ? `${c.value}% off${c.max_discount ? ` (max ${formatTaka(c.max_discount)})` : ''}`
  : c.type === 'fixed' ? `${formatTaka(c.value)} off` : 'Free delivery');

export default async function CouponsPage() {
  const staff = await requireStaff(['admin', 'manager']);
  const { data: coupons } = await staff.supabase.from('coupons').select('*').order('created_at', { ascending: false });
  return (
    <>
      <h1 className="admin-h1">Coupons</h1>
      <details className="panel" style={{ marginBottom: 16 }}>
        <summary><strong>+ New coupon</strong></summary>
        <div style={{ marginTop: 12 }}><ActionForm action={saveCoupon} submitLabel="Create coupon"><CouponFields /></ActionForm></div>
      </details>
      {(coupons ?? []).length === 0 && <p className="empty">No coupons yet.</p>}
      {(coupons ?? []).map((c) => (
        <details key={c.id} className="panel" style={{ marginBottom: 10 }}>
          <summary><strong className="code-link">{c.code}</strong> <span className="hint">· {describe(c)}{c.min_order ? ` · min ${formatTaka(c.min_order)}` : ''}
            {' · used '}{c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ''}{c.expires_at ? ` · expires ${formatDate(c.expires_at)}` : ''}{c.is_active ? '' : ' · OFF'}</span></summary>
          <div style={{ marginTop: 12 }}>
            <ActionForm action={saveCoupon} submitLabel="Save"><CouponFields c={c} /></ActionForm>
            {c.used_count === 0 && (
              <div style={{ marginTop: 10 }}><ActionButton action={deleteCoupon.bind(null, c.id)} className="btn btn-ghost btn-sm" confirm={`Delete ${c.code}?`}>Delete coupon</ActionButton></div>
            )}
          </div>
        </details>
      ))}
    </>
  );
}
