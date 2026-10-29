import { notFound } from 'next/navigation';
import { requireStaff } from '../../../../../../lib/server/auth.js';
import { formatDate, formatTaka, formatBdPhone } from '../../../../../../components/admin/ui.js';
import PrintButton from '../../../../../../components/admin/PrintButton.js';
import { SITE } from '../../../../../../lib/site.js';

export const metadata = { title: 'Invoice' };

export default async function InvoicePage({ params }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: o } = await staff.supabase.from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle();
  if (!o) notFound();

  return (
    <div className="invoice">
      <div className="no-print" style={{ marginBottom: 16 }}><PrintButton /></div>
      <header className="invoice-head">
        <div>
          <div className="wordmark-main">Yojigen Poketto</div>
          <div className="hint">{SITE.address} · {SITE.phone}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{o.code}</div>
          <div>{formatDate(o.created_at)}</div>
        </div>
      </header>
      <section style={{ margin: '18px 0' }}>
        <div className="label">Deliver to</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{o.name}</div>
        <div style={{ fontSize: 18 }}>{formatBdPhone(o.phone)}</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{o.address}</div>
        {o.note && <div style={{ marginTop: 6 }}>Note: {o.note}</div>}
      </section>
      <table className="table">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}><td>{i.title}{i.variant_name ? ` · ${i.variant_name}` : ''}</td><td>{i.quantity}</td>
              <td>{formatTaka(i.unit_price)}</td><td>{formatTaka(i.line_total)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="totals" style={{ maxWidth: 300, marginLeft: 'auto', marginTop: 12 }}>
        <div className="row"><span>Subtotal</span><span>{formatTaka(o.subtotal)}</span></div>
        {o.discount > 0 && <div className="row"><span>Discount</span><span>−{formatTaka(o.discount)}</span></div>}
        <div className="row"><span>Delivery</span><span>{formatTaka(o.delivery_fee)}</span></div>
        <div className="row grand"><span>Cash to collect</span><span>{formatTaka(o.total)}</span></div>
      </div>
      <p className="hint" style={{ marginTop: 24 }}>Thank you for shopping with Yojigen Poketto. Questions: {SITE.phone} (call / WhatsApp)</p>
    </div>
  );
}
