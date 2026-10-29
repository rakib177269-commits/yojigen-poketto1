import Link from 'next/link';
import { getCustomer } from '../../../lib/server/customer-session.js';
import { supabaseService } from '../../../lib/server/supabase.js';
import { smsConfigured } from '../../../lib/server/notify.js';
import { signOut } from '../../../lib/account-actions.js';
import { formatBdPhone } from '../../../lib/phone.js';
import { formatDate, formatTaka } from '../../../lib/format.js';
import { STATUS_TEXT } from '../../../components/OrderDetails.js';
import AccountSignIn from '../../../components/AccountSignIn.js';
import AccountProfile from '../../../components/AccountProfile.js';

export const metadata = { title: 'My account', robots: { index: false, follow: false } };

export default async function AccountPage() {
  const me = await getCustomer();
  if (!me) {
    return (
      <div className="container narrow">
        <h1 className="display" style={{ fontSize: 36 }}>My account</h1>
        {smsConfigured() ? <AccountSignIn /> : (
          <div className="panel">
            <p style={{ marginTop: 0 }}>Accounts are opening soon: sign-in codes are sent by SMS, which isn’t switched on yet.</p>
            <p style={{ marginBottom: 0 }}>You can already <Link href="/track">track an order</Link> with its code and your mobile number.</p>
          </div>
        )}
      </div>
    );
  }

  const { data: acc } = await supabaseService().rpc('customer_account', { p_customer_id: me.customerId });
  return (
    <div className="container narrow">
      <h1 className="display" style={{ fontSize: 36 }}>My account</h1>
      <p className="hint">Signed in as {formatBdPhone(acc?.phone ?? me.phone)}</p>

      <section className="panel" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Your orders</h2>
        {!acc?.orders?.length ? <p style={{ margin: 0 }}>No orders yet. <Link href="/shop">Start shopping</Link>.</p> : (
          <ul className="account-orders">
            {acc.orders.map((o) => (
              <li key={o.code}>
                <Link href={`/order/${o.code}`}><strong>{o.code}</strong></Link>
                <span>{formatDate(o.created_at)} · {o.items} item{o.items === 1 ? '' : 's'} · {formatTaka(o.total)}</span>
                <span className="hint">{STATUS_TEXT[o.status] ?? o.status}{o.status === 'dispatched' && o.courier_status ? ` · ${o.courier_status}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Your details</h2>
        <AccountProfile name={acc?.name ?? acc?.last_address?.name} email={acc?.email} />
      </section>

      <form action={signOut}><button className="btn btn-ghost">Sign out</button></form>
    </div>
  );
}
