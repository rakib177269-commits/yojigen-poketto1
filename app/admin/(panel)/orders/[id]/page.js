import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, can } from '../../../../../lib/server/auth.js';
import { productOptions } from '../../../../../lib/admin/products.js';
import { confirmOrder, rejectOrder, setStatus, updateOrder } from '../../../../../lib/admin/actions.js';
import { refreshPathaoStatus } from '../../../../../lib/admin/courier-actions.js';
import { pathaoConfigured } from '../../../../../lib/server/pathao.js';
import PathaoBook from '../../../../../components/admin/PathaoBook.js';
import PathaoHistory from '../../../../../components/admin/PathaoHistory.js';
import ActionButton from '../../../../../components/admin/ActionButton.js';
import ActionForm from '../../../../../components/admin/ActionForm.js';
import ItemsEditor from '../../../../../components/admin/ItemsEditor.js';
import { StatusBadge, formatDate, formatTaka, formatBdPhone } from '../../../../../components/admin/ui.js';

export const metadata = { title: 'Order' };

function CustomerCheck({ check, phone, pathao }) {
  if (!check) return null;
  const others = check.orders - 1;
  return (
    <section className="panel">
      <h2>Customer check</h2>
      {others <= 0 ? <p>First order from this number.</p> : (
        <>
          <p>
            <strong>{check.orders}</strong> orders from this number ·{' '}
            {check.success_rate != null
              ? <>delivery success <strong className={check.success_rate < 70 ? 'error-text' : 'ok-text'}>{check.success_rate}%</strong> ({check.delivered} delivered, {check.returned} returned)</>
              : 'none delivered or returned yet'}
          </p>
          {check.rejected > 0 && <p className="error-text">{check.rejected} earlier order(s) were rejected as fake/spam.</p>}
          {check.names.length > 1 && <p className="hint">Names used: {check.names.join(', ')}</p>}
          <ul className="plain-list">
            {check.recent.map((o) => (
              <li key={o.id}><Link href={`/admin/orders/${o.id}`}>{o.code}</Link> · <StatusBadge status={o.status} /> · {formatTaka(o.total)} · {formatDate(o.created_at)}</li>
            ))}
          </ul>
        </>
      )}
      {pathao ? <PathaoHistory phone={phone} /> : <p className="hint">Connect Pathao (Settings) to see this number’s delivery history across all shops.</p>}
    </section>
  );
}

export default async function OrderPage({ params, searchParams }) {
  const staff = await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = staff.role;

  const { data: o } = await staff.supabase.from('orders')
    .select('*, items:order_items(*), events:order_events(*), zone:delivery_zones(name)')
    .eq('id', id).maybeSingle();
  if (!o) notFound();
  o.events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const editable = can.edit(r) && ['pending', 'confirmed'].includes(o.status);
  const [check, options, settings] = await Promise.all([
    can.customers(r) ? staff.supabase.rpc('admin_customer_check', { p_phone: o.phone }).then((x) => x.data) : null,
    editable ? productOptions(staff.supabase) : [],
    staff.supabase.from('store_settings').select('integrations').eq('id', 1).single().then((x) => x.data),
  ]);
  const pathaoCfg = settings?.integrations?.pathao;
  const pathaoReady = pathaoConfigured() && Boolean(pathaoCfg?.store_id);
  const local = formatBdPhone(o.phone);

  return (
    <>
      <div className="admin-head">
        <div>
          <Link href="/admin/orders" className="hint">← Orders</Link>
          <h1 className="admin-h1" style={{ margin: '4px 0' }}>{o.code} <StatusBadge status={o.status} /></h1>
          <div className="hint">
            {formatDate(o.created_at)} · {o.source === 'manual' ? 'Manual order' : 'Website'} · Cash on Delivery
            {o.marketing_status === 'rejected' && ' · rejected as fake/spam'}
          </div>
        </div>
        <Link href={`/admin/orders/${o.id}/invoice`} className="btn btn-ghost btn-sm" target="_blank">Print invoice</Link>
      </div>
      {created && <div className="notice" style={{ marginBottom: 14 }}>Manual order created.</div>}

      <section className="panel actions-bar">
        {o.status === 'pending' && can.confirm(r) && (
          <ActionButton action={confirmOrder.bind(null, o.id)}>Confirm order</ActionButton>
        )}
        {o.status === 'confirmed' && can.dispatch(r) && (
          <ActionButton action={setStatus.bind(null, o.id, 'dispatched', null, null)} className={pathaoReady ? 'btn btn-ghost btn-sm' : undefined}
            confirm={pathaoReady ? 'Mark as dispatched WITHOUT booking Pathao (e.g. another courier or hand delivery)?' : undefined}>
            {pathaoReady ? 'Mark dispatched (other courier)' : 'Mark dispatched'}</ActionButton>
        )}
        {o.status === 'dispatched' && can.deliver(r) && (
          <>
            <ActionButton action={setStatus.bind(null, o.id, 'delivered', null, null)}>Mark delivered</ActionButton>
            <details className="inline-details">
              <summary className="btn btn-ghost btn-sm">Mark returned…</summary>
              <ActionForm action={setStatus.bind(null, o.id, 'returned')} submitLabel="Mark returned" submitClass="btn btn-ghost btn-sm">
                <label className="check"><input type="radio" name="restock" value="yes" defaultChecked /> Put items back in stock</label>
                <label className="check"><input type="radio" name="restock" value="no" /> Items are damaged: don’t restock</label>
              </ActionForm>
            </details>
          </>
        )}
        {['pending', 'confirmed'].includes(o.status) && can.confirm(r) && (
          <>
            <details className="inline-details">
              <summary className="btn btn-ghost btn-sm">Reject (fake / spam)…</summary>
              <ActionForm action={rejectOrder.bind(null, o.id)} submitLabel="Reject order" submitClass="btn btn-danger btn-sm">
                <div className="field"><label htmlFor="reason">Reason (internal)</label>
                  <input id="reason" name="reason" className="input" placeholder="e.g. phone switched off, fake name" /></div>
              </ActionForm>
            </details>
            <ActionButton action={setStatus.bind(null, o.id, 'cancelled', null, null)} className="btn btn-ghost btn-sm"
              confirm="Cancel this order? Items go back into stock.">Cancel (customer asked)</ActionButton>
          </>
        )}
        {['delivered', 'cancelled', 'returned'].includes(o.status) && <span className="hint">No further actions for this order.</span>}
        {r === 'packer' && o.status !== 'confirmed' && <span className="hint">Packers can mark confirmed orders as dispatched.</span>}
      </section>

      <div className="admin-grid">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="panel">
            <h2>Customer</h2>
            <p style={{ margin: 0 }}><strong>{o.name}</strong></p>
            <p style={{ margin: '4px 0' }}>
              <a href={`tel:+${o.phone}`}>{local}</a> · <a href={`https://wa.me/${o.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              {o.email && <> · {o.email}</>}
            </p>
            <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{o.address}</p>
            <p className="hint" style={{ margin: 0 }}>Delivery zone: {o.zone?.name}</p>
            {o.note && <p className="notice" style={{ marginTop: 10 }}>Note: {o.note}</p>}
          </section>

          <section className="panel">
            <h2>Items</h2>
            <table className="table">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}><td>{i.title}{i.variant_name && <span className="hint"> · {i.variant_name}</span>}</td>
                    <td>{i.quantity}</td><td>{formatTaka(i.unit_price)}</td><td>{formatTaka(i.line_total)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="totals" style={{ marginTop: 10, maxWidth: 320, marginLeft: 'auto' }}>
              <div className="row"><span>Subtotal</span><span>{formatTaka(o.subtotal)}</span></div>
              {o.discount > 0 && <div className="row"><span>Discount{o.coupon_code ? ` (${o.coupon_code})` : ''}</span><span>−{formatTaka(o.discount)}</span></div>}
              <div className="row"><span>Delivery</span><span>{formatTaka(o.delivery_fee)}</span></div>
              <div className="row grand"><span>Collect on delivery</span><span>{formatTaka(o.total)}</span></div>
            </div>
          </section>

          {editable && (
            <details className="panel">
              <summary><strong>Edit order</strong> <span className="hint">(saved changes are recorded in the audit log)</span></summary>
              <ActionForm action={updateOrder.bind(null, o.id)} submitLabel="Save changes">
                <div className="form-2">
                  <div className="field"><label htmlFor="e-name">Name</label><input id="e-name" name="name" className="input" defaultValue={o.name} /></div>
                  <div className="field"><label htmlFor="e-phone">Phone</label><input id="e-phone" name="phone" className="input" defaultValue={local} /></div>
                </div>
                <div className="field"><label htmlFor="e-address">Address</label><textarea id="e-address" name="address" className="textarea" defaultValue={o.address} /></div>
                <div className="field"><label htmlFor="e-note">Note</label><input id="e-note" name="note" className="input" defaultValue={o.note ?? ''} /></div>
                <div className="form-2">
                  <div className="field"><label htmlFor="e-fee">Delivery fee (৳)</label><input id="e-fee" name="delivery_fee" inputMode="numeric" className="input" defaultValue={o.delivery_fee} /></div>
                  <div className="field"><label htmlFor="e-disc">Discount (৳)</label><input id="e-disc" name="discount" inputMode="numeric" className="input" defaultValue={o.discount} /></div>
                </div>
                <fieldset className="fieldset">
                  <legend>Items</legend>
                  <label className="check"><input type="checkbox" name="edit_items" value="1" /> Also save item changes below (re-prices items at today’s prices and adjusts stock)</label>
                  <ItemsEditor options={options} initial={o.items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity }))} />
                </fieldset>
              </ActionForm>
            </details>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <CustomerCheck check={check} phone={o.phone} pathao={pathaoConfigured()} />
          {(o.courier_consignment_id || (o.status === 'confirmed' && can.dispatch(r))) && (
            <section className="panel">
              <h2>Courier</h2>
              {o.courier_consignment_id ? (
                <>
                  <p style={{ margin: 0 }}>Pathao consignment <strong className="code-link">{o.courier_consignment_id}</strong>
                    {o.courier_fee != null && <span className="hint"> · Pathao fee {formatTaka(o.courier_fee)}</span>}</p>
                  <p style={{ margin: '4px 0' }}>Latest: <strong>{o.courier_status ?? '—'}</strong>
                    {o.courier_updated_at && <span className="hint"> · {formatDate(o.courier_updated_at)}</span>}</p>
                  {o.status === 'dispatched' && pathaoConfigured() && (
                    <ActionButton action={refreshPathaoStatus.bind(null, o.id)} className="btn btn-ghost btn-sm">Ask Pathao for the latest status</ActionButton>
                  )}
                </>
              ) : pathaoReady ? (
                <PathaoBook orderId={o.id} defaultWeight={pathaoCfg.default_weight ?? 0.5} />
              ) : (
                <p className="hint" style={{ margin: 0 }}>
                  Pathao isn’t connected yet{!pathaoConfigured() ? ' (API keys missing in Netlify)' : ' (choose your Pathao store)'}.
                  {r === 'admin' ? <> Set it up in <Link href="/admin/settings">Settings</Link>.</> : ' Ask the admin.'}
                </p>
              )}
            </section>
          )}
          <section className="panel">
            <h2>Timeline</h2>
            <ol className="timeline">
              {o.events.map((e) => (
                <li key={e.id}>
                  <div>{e.label}{!e.is_public && <span className="hint"> (internal)</span>}</div>
                  {e.detail?.reason && <div className="hint">Reason: {e.detail.reason}</div>}
                  {e.detail?.note && <div className="hint">Note: {e.detail.note}</div>}
                  <div className="when">{formatDate(e.created_at)} · {e.source}</div>
                </li>
              ))}
            </ol>
          </section>
          {can.audit(r) && (
            <section className="panel">
              <h2>Marketing</h2>
              <p className="hint" style={{ margin: 0 }}>
                {o.marketing_status === 'rejected' ? 'Rejected: this order is never reported as a sale.'
                  : o.marketing_status === 'pending' ? 'Reported as a sale to Facebook / Google only after it is confirmed.'
                    : <>Purchase report: Facebook {o.capi_sent_at ? `sent ${formatDate(o.capi_sent_at)}` : 'not sent yet'}
                      {' · '}Google {o.marketing_sent?.ga4 ? `sent ${formatDate(o.marketing_sent.ga4)}` : 'not sent yet'}
                      {o.capi_attempts > 0 && !o.capi_sent_at && ` · ${o.capi_attempts} attempt(s)`}.</>}
                {' '}Facebook click id {o.fbc ? 'captured' : 'not present'}, browser id {o.fbp ? 'captured' : 'not present'}.
              </p>
              {o.capi_last_error && <p className="error-text" style={{ margin: '6px 0 0' }}>Last error: {o.capi_last_error}</p>}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
