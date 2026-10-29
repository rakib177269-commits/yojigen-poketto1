import Link from 'next/link';
import { SITE } from '../../../lib/site.js';

export const metadata = { title: 'About us', description: `About ${SITE.name}: gadgets, gifts and cute things with Cash on Delivery across Bangladesh.`, alternates: { canonical: '/about' } };

export default function AboutPage() {
  return (
    <div className="container prose">
      <h1>About {SITE.name}</h1>
      <p>
        <em>Yojigen poketto</em> means “four-dimensional pocket”: a pocket that always has
        the right little thing inside. That is what we want to be for you: a small shop of
        handpicked gadgets, gifts, cute items and accessories, delivered anywhere in Bangladesh.
      </p>
      <h2>How we work</h2>
      <p>
        Every order is Cash on Delivery. After you order, we call you to confirm, pack your
        parcel and hand it to our courier. You pay the rider when it arrives.
      </p>
      <h2>Contact</h2>
      <p>
        Phone and WhatsApp: <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a><br />
        Facebook: <a href={SITE.facebook} rel="noopener noreferrer" target="_blank">facebook.com/yojigenpoketto1</a><br />
        Instagram: <a href={SITE.instagram} rel="noopener noreferrer" target="_blank">@yojigen_poketto_</a><br />
        Address: {SITE.address}
      </p>
      <p><Link href="/shop">Browse the shop →</Link></p>
    </div>
  );
}
