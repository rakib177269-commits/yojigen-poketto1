import Link from 'next/link';
import { notFound } from 'next/navigation';
import OrderDetails from '../../../../components/OrderDetails.js';
import { callRpc } from '../../../../lib/server/request.js';
import { SITE } from '../../../../lib/site.js';

export const metadata = { title: 'Your order', robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }) {
  const { code } = await params;
  const { new: isNew } = await searchParams;
  if (!/^YP[A-Z0-9]{7}$/i.test(code)) notFound();
  const order = await callRpc('get_order_summary', { p_code: code });
  if (!order || order.ok === false || !order.code) notFound();

  return (
    <div className="container narrow">
      <span className="eyebrow">{isNew ? 'Thank you' : 'Order'}</span>
      <h1 className="display" style={{ fontSize: 36 }}>
        {isNew ? `Thank you, ${order.first_name}!` : 'Your order'}
      </h1>
      {isNew && (
        <p>
          We&apos;ve received your order. We&apos;ll call you on <strong>{order.phone_masked}</strong> to
          confirm it before we send it out. Please keep your phone nearby.
        </p>
      )}
      <div className="notice" style={{ margin: '18px 0' }}>
        Your order code is <span className="code-box">{order.code}</span>
        <div className="hint" style={{ marginTop: 4 }}>Save it to track your order from any device.</div>
      </div>
      <OrderDetails order={order} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
        <Link href={`/track?code=${order.code}`} className="btn btn-ghost">Track this order</Link>
        <Link href="/shop" className="btn btn-primary">Continue shopping</Link>
      </div>
      <p className="hint" style={{ marginTop: 18 }}>
        Questions? Call or WhatsApp <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a>.
      </p>
    </div>
  );
}
