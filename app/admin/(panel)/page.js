import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaff, can } from '../../../lib/server/auth.js';
import { Stat, formatDate, formatTaka } from '../../../components/admin/ui.js';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard({ searchParams }) {
  const staff = await requireStaff();
  if (!can.dashboard(staff.role)) redirect('/admin/orders');
  const { denied } = await searchParams;
  const { data: d, error } = await staff.supabase.rpc('admin_dashboard');
  if (error) throw new Error(error.message);

  return (
    <>
      <h1 className="admin-h1">Dashboard</h1>
      {denied && <div className="alert" role="alert">Your role can’t open that page.</div>}
      {d.stale_pending.length > 0 && (
        <div className="alert" role="alert" style={{ marginBottom: 16 }}>
          <strong>{d.stale_pending.length} order{d.stale_pending.length > 1 ? 's have' : ' has'} waited more than 4 days for confirmation.</strong>{' '}
          Meta ignores sales reported more than 7 days late, so confirm or reject these soon:{' '}
          {d.stale_pending.map((o, i) => (
            <span key={o.id}>{i ? ', ' : ''}<Link href={`/admin/orders/${o.id}`}>{o.code}</Link></span>
          ))}
        </div>
      )}
      <div className="stats">
        <Stat label="Orders today" value={d.orders_today} />
        <Stat label="Orders this week" value={d.orders_week} />
        <Stat label="Revenue today" value={formatTaka(d.revenue_today)} />
        <Stat label="Revenue this week" value={formatTaka(d.revenue_week)} />
        <Stat label="Waiting for confirmation" value={d.pending} tone={d.pending ? 'warn' : ''} href="/admin/orders?status=pending" />
        <Stat label="Confirmed, to dispatch" value={d.to_dispatch} href="/admin/orders?status=confirmed" />
        <Stat label="Open abandoned carts" value={d.abandoned_open} href="/admin/abandoned" />
      </div>
      <p className="hint">Revenue counts confirmed, dispatched and delivered orders only. Weeks start on Monday (Dhaka time).</p>

      <section className="panel" style={{ marginTop: 20 }}>
        <h2>Low stock (3 or fewer)</h2>
        {d.low_stock.length === 0 ? <p className="hint">Nothing is running low.</p> : (
          <table className="table">
            <thead><tr><th>Product</th><th>Colour</th><th>Stock</th></tr></thead>
            <tbody>
              {d.low_stock.map((s, i) => (
                <tr key={i}><td>{s.title}</td><td>{s.variant ?? '—'}</td><td className={s.stock === 0 ? 'error-text' : ''}>{s.stock}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="hint" style={{ marginTop: 12 }}>Updated {formatDate(new Date().toISOString())}</p>
    </>
  );
}
