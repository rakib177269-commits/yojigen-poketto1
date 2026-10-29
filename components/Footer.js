import Link from 'next/link';
import NewsletterForm from './NewsletterForm.js';
import { FacebookIcon, InstagramIcon, WhatsappIcon } from './Icons.js';
import { SITE } from '../lib/site.js';

export default function Footer({ categories }) {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <span className="wordmark-main">Yojigen Poketto</span>
          <p style={{ marginTop: 14, maxWidth: '34ch' }}>{SITE.tagline}</p>
          <p style={{ margin: 0 }}>
            Call or WhatsApp: <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a><br />
            {SITE.address}
          </p>
          <div className="social">
            <a href={SITE.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"><FacebookIcon /></a>
            <a href={SITE.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><InstagramIcon /></a>
            <a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><WhatsappIcon /></a>
          </div>
        </div>
        <nav aria-label="Shop">
          <h2>Shop</h2>
          <ul>
            <li><Link href="/shop">All products</Link></li>
            {categories.map((c) => <li key={c.slug}><Link href={`/shop/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Help">
          <h2>Help</h2>
          <ul>
            <li><Link href="/track">Track your order</Link></li>
            <li><Link href="/account">My account</Link></li>
            <li><Link href="/shipping">Delivery &amp; fees</Link></li>
            <li><Link href="/returns">Returns</Link></li>
            <li><Link href="/about">About us</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/terms">Terms</Link></li>
          </ul>
        </nav>
        <div>
          <h2>Newsletter</h2>
          <p style={{ margin: 0 }}>New arrivals and offers, now and then. No spam.</p>
          <NewsletterForm />
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} {SITE.name}</span>
        <span>Cash on Delivery · bKash / Nagad coming soon</span>
      </div>
    </footer>
  );
}
