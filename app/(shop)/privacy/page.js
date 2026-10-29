import { SITE } from '../../../lib/site.js';

export const metadata = { title: 'Privacy policy', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <div className="container prose">
      <h1>Privacy policy</h1>
      <p>This page explains what information {SITE.name} collects and why.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Order details:</strong> your name, mobile number, delivery address, optional email and note, and what you ordered. We need these to deliver your order and to call you to confirm it.</li>
        <li><strong>Checkout progress:</strong> if you type a valid mobile number at checkout but don&apos;t finish, we keep that number and your cart so we can follow up once.</li>
        <li><strong>Technical data:</strong> your IP address and browser type when you order, used to prevent fake orders and abuse.</li>
        <li><strong>Your cart and wishlist</strong> are stored only in your own browser.</li>
        <li><strong>Newsletter:</strong> your email, only if you subscribe. Every email has an unsubscribe link.</li>
      </ul>
      <h2>Advertising and analytics</h2>
      <p>
        We may use the Meta (Facebook) Pixel and Google Analytics to measure our ads.
        When an order is confirmed we may share a hashed (scrambled) version of your phone, email,
        name and city with these services so they can match the purchase to an ad. They never
        receive your address.
      </p>
      <h2>Who we share data with</h2>
      <p>
        Our courier (Pathao) receives your name, phone, address and the amount to collect, to
        deliver your parcel. We do not sell your data.
      </p>
      <h2>Your choices</h2>
      <p>
        To see, correct or delete your data, contact us at <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a>.
      </p>
    </div>
  );
}
