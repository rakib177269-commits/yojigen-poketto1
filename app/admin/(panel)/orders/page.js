import Link from 'next/link';
import { requireStaff, can } from '../../../../lib/server/auth.js';
import { StatusBadge, STATUS_LABEL, formatDate, formatTaka, formatBdPhone } from '../../../../components/admin/ui.js';
import { normalizeBdPhone } from '../../../../lib/phone.js';

export const metadata = { title: 'Orders' };
const PAGE = 50;

export default async function OrdersPage({ searchParams }) {
  const staff = await requireStaff();
  const params = await searchParams;
  const status = STATUS_LABEL[params.status] ? params.status : '';
  const q = String(params.q ?? '').trim().slice(0, 60);
  const page = Math.max(0, Number.parseInt(params.page, 10) || 0);
  const tabs = staff.role === 'packer' ? ['confirmed', 'dispatched'] : Object.keys(STATUS_LABEL);

  let query = staff.supabase.from('orders')
    .select('id, code, created_at, status, source, name, phone, total, zone_code, marketing_status', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (status) query = query.eq('status', status);
  if (q) {
    const phone = normalizeBdPhone(q);
    if (phone) query = query.eq('phone', phone);
    else if (/^YP[A-Z0-9]{3,7}$/i.test(q)) query = query.ilike('code', `${q.toUpperCase()}%`);
    else query = query.ilike('name', `%${q.replace(/[%_,()]/g, '')}%`);
  }
  const { data: orders, count, error } = await query;
  if (error) throw new Error(error.message);

  const href = (p) => `/admin/orders?${new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...p })}`;

  return (
    <>
      <div className="admin-head">
        <h1 className="admin-h1">Orders</h1>
        <div className="row-gap">
          {can.edit(staff.role) && <Link href="/admin/orders/new" className="btn btn-primary btn-sm">New manual order</Link>}
          {can.export(staff.role) && (
            <form action="/admin/export" className="row-gap" aria-label="Export orders as CSV">
              <label className="sr-only" htmlFor="ex-from">From</label><input id="ex-from" type="date" name="from" className="input input-sm" />
              <label className="sr-only" htmlFor="ex-to">To</label><input id="ex-to" type="date" name="to" className="input input-sm" />
              <button className="btn btn-ghost btn-sm">Export CSV</button>
            </form>
          )}
        </div>
      </div>
      <nav className="chips" aria-label="Filter by status">
        {staff.role !== 'packer' && <Link className="chip" href="/admin/orders" aria-current={!status ? 'page' : undefined}>All</Link>}
        {tabs.map((s) => (
          <Link key={s} className="chip" href={`/admin/orders?status=${s}`} aria-current={status === s ? 'page' : undefined}>{STATUS_LABEL[s]}</Link>
        ))}
      </nav>
      <form className="row-gap" style={{ marginBottom: 14 }} role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="q" className="sr-only">Search orders</label>
        <input id="q" name="q" className="input" defaultValue={q} placeholder="Order code, phone or name" style={{ maxWidth: 320 }} />
        <button className="btn btn-ghost btn-sm">Search</button>
      </form>

      {orders.length === 0 ? <p className="empty">No orders here yet.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`} className="code-link">{o.code}</Link>{o.source === 'manual' && <span className="hint"> · manual</span>}</td>
                  <td className="nowrap">{formatDate(o.created_at)}</td>
                  <td>{o.name}<div className="hint">{formatBdPhone(o.phone)}</div></td>
                  <td className="nowrap">{formatTaka(o.total)}</td>
                  <td><StatusBadge status={o.status} />{o.marketing_status === 'rejected' && <div className="hint">rejected</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row-gap" style={{ marginTop: 14 }}>
        {page > 0 && <Link className="btn btn-ghost btn-sm" href={href({ page: page - 1 })}>← Newer</Link>}
        {(page + 1) * PAGE < count && <Link className="btn btn-ghost btn-sm" href={href({ page: page + 1 })}>Older →</Link>}
        <span className="hint">{count} order{count === 1 ? '' : 's'}</span>
      </div>
    </>
  );
}
