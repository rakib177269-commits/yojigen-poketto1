import Link from 'next/link';
import { SITE } from '../../../lib/site.js';

export const metadata = { title: 'Terms', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <div className="container prose">
      <h1>Terms of sale</h1>
      <h2>Orders</h2>
      <p>
        Placing an order is a request to buy. An order is accepted when we confirm it by phone.
        We may decline or cancel an order, for example if a product is out of stock, the address
        can&apos;t be reached, or we can&apos;t reach you to confirm.
      </p>
      <h2>Prices and payment</h2>
      <p>
        Prices are in Bangladeshi Taka (৳) and include the item only; the delivery fee is shown at
        checkout before you order. Payment is Cash on Delivery to the courier rider.
      </p>
      <h2>Delivery</h2>
      <p>See <Link href="/shipping">Delivery &amp; fees</Link>.</p>
      <h2>Returns</h2>
      <p>All sales are final. See our <Link href="/returns">returns policy</Link>.</p>
      <h2>Contact</h2>
      <p>{SITE.name}, {SITE.address}. Phone/WhatsApp <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a>.</p>
    </div>
  );
}
