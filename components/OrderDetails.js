import { formatDate, formatTaka } from '../lib/format.js';

const STATUS_TEXT = {
  pending: 'Order received — we will call you to confirm',
  confirmed: 'Confirmed — being packed',
  dispatched: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export default function OrderDetails({ order }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="panel">
        <div className="label">Status</div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 14px', color: 'var(--blue-deep)' }}>
          {STATUS_TEXT[order.status] || order.status}
        </p>
        <ol className="timeline">
          {order.timeline.map((e, i) => (
            <li key={i}>
              <div>{e.label}</div>
              <div className="when">{formatDate(e.at)}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="panel">
        <div className="label" style={{ marginBottom: 6 }}>Items</div>
        {order.items.map((i, idx) => (
          <div key={idx} className="totals" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row">
              <span>{i.title}{i.variant_name ? ` · ${i.variant_name}` : ''} × {i.quantity}</span>
              <span>{formatTaka(i.line_total)}</span>
            </div>
          </div>
        ))}
        <div className="totals" style={{ marginTop: 12 }}>
          <div className="row"><span>Subtotal</span><span>{formatTaka(order.subtotal)}</span></div>
          {order.discount > 0 && <div className="row"><span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</span><span>−{formatTaka(order.discount)}</span></div>}
          <div className="row"><span>Delivery ({order.zone.name})</span><span>{order.delivery_fee ? formatTaka(order.delivery_fee) : 'Free'}</span></div>
          <div className="row grand"><span>To pay on delivery</span><span>{formatTaka(order.total)}</span></div>
        </div>
      </div>
    </div>
  );
}
