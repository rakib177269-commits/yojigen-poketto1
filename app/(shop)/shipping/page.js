import { getDeliveryZones, getSettings } from '../../../lib/server/catalog.js';
import { formatTaka } from '../../../lib/format.js';
import { SITE } from '../../../lib/site.js';

export const metadata = { title: 'Delivery & fees', description: 'Delivery areas, fees and times. Cash on Delivery across Bangladesh.', alternates: { canonical: '/shipping' } };

export default async function ShippingPage() {
  const [zones, settings] = await Promise.all([getDeliveryZones(), getSettings()]);
  const threshold = settings?.free_shipping_threshold;
  return (
    <div className="container prose">
      <h1>Delivery &amp; fees</h1>
      <p>We deliver all over Bangladesh with Pathao courier. Payment is Cash on Delivery.</p>
      <table>
        <thead><tr><th>Area</th><th>Fee</th><th>Delivery time</th></tr></thead>
        <tbody>
          {zones.map((z) => (
            <tr key={z.code}><td>{z.name}</td><td>{formatTaka(z.fee)}</td><td>{z.eta || '—'}</td></tr>
          ))}
        </tbody>
      </table>
      {threshold ? <p><strong>Free delivery</strong> on orders of {formatTaka(threshold)} or more (after any discount).</p> : null}
      <h2>How the fee is worked out</h2>
      <p>
        The fee is calculated from the address you type at checkout, in English or Bangla.
        Dhaka outskirts (Savar, Ashulia, Keraniganj, Gazipur, Tongi, Narayanganj, Demra) are
        charged as outskirts even if you also write “Dhaka”. You always see the fee before you
        place the order.
      </p>
      <h2>After you order</h2>
      <p>
        We call you to confirm, then pack and send your parcel. Delivery times are counted from
        confirmation and can be longer during holidays or bad weather. You can follow your parcel
        on the <a href="/track">Track order</a> page with your order code.
      </p>
      <p>Questions? Call or WhatsApp <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a>.</p>
    </div>
  );
}
