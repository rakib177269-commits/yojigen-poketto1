'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './StoreProvider.js';
import { CartLines, FreeDeliveryProgress } from './CartDrawer.js';
import { readAttribution } from './Attribution.js';
import { normalizeBdPhone, formatBdPhone } from '../lib/phone.js';
import { formatTaka } from '../lib/format.js';
import { errorMessage, LINE_PROBLEMS } from '../lib/errors.js';
import { track } from '../lib/track.js';

const toItems = (cart) => cart.map((l) => ({ product_id: l.productId, variant_id: l.variantId || null, quantity: l.qty }));

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false, error: 'server_error' }));
}

export default function CheckoutForm({ initial = null }) {
  const router = useRouter();
  const { cart, ready, clearCart, cartSubtotal } = useStore();
  const [form, setForm] = useState({ name: '', phone: '', address: '', note: '', email: '', ...(initial ?? {}) });
  const [touched, setTouched] = useState({});
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const capturedFor = useRef('');
  const initiated = useRef(false);

  const items = useMemo(() => toItems(cart), [cart]);
  const phone = normalizeBdPhone(form.phone);

  useEffect(() => {
    if (ready && cart.length && !initiated.current) {
      initiated.current = true;
      track('InitiateCheckout', {
        content_ids: cart.map((l) => l.productId), content_type: 'product',
        num_items: cart.reduce((n, l) => n + l.qty, 0), value: cartSubtotal, currency: 'BDT',
      });
    }
  }, [ready, cart, cartSubtotal]);

  // Live preview, priced by the server (debounced while typing the address).
  useEffect(() => {
    if (!ready || !items.length) { setQuote(null); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await fetch('/api/quote', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
          body: JSON.stringify({ items, address: form.address, coupon }),
        });
        setQuote(await res.json());
      } catch (e) {
        if (e.name !== 'AbortError') setQuote({ ok: false, error: 'server_error' });
      } finally {
        setQuoting(false);
      }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [ready, items, form.address, coupon]);

  // Abandoned-cart capture: once a valid phone is typed.
  function captureCart() {
    if (!phone || capturedFor.current === phone || !items.length) return;
    capturedFor.current = phone;
    post('/api/cart-capture', { phone, name: form.name, address: form.address, items }).catch(() => {});
  }

  const errors = {
    name: form.name.trim().length < 2 ? 'Please enter your name.' : '',
    phone: !phone ? 'Enter a valid mobile number, e.g. 01712-345678 or ০১৭১২৩৪৫৬৭৮.' : '',
    address: form.address.trim().length < 8 ? 'Please enter your full address: house, road, area and district.' : '',
    email: form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ? 'That email doesn\'t look right.' : '',
  };
  const invalid = Object.values(errors).some(Boolean);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const show = (k) => touched[k] && errors[k];

  async function placeOrder(e) {
    e.preventDefault();
    setTouched({ name: true, phone: true, address: true, email: true });
    setError('');
    if (invalid || submitting) return;
    setSubmitting(true);
    const result = await post('/api/orders', { ...form, phone, coupon, items, ...readAttribution() });
    if (result.ok) {
      clearCart();
      router.push(`/order/${result.code}?new=1`);
      return;
    }
    setSubmitting(false);
    setError(result.message || errorMessage(result.error));
    if (result.quote) setQuote({ ...result.quote, ok: false });
  }

  if (ready && cart.length === 0) {
    return (
      <div className="narrow" style={{ textAlign: 'center' }}>
        <h1 className="display" style={{ fontSize: 34 }}>Your cart is empty</h1>
        <p>Add something you love, then come back to check out.</p>
        <Link href="/shop" className="btn btn-primary">Browse the shop</Link>
      </div>
    );
  }

  const problems = new Map((quote?.lines ?? []).filter((l) => l.problem).map((l) => [`${l.product_id}:${l.variant_id || ''}`, l]));
  const couponState = quote?.coupon;

  return (
    <form className="checkout" onSubmit={placeOrder} noValidate>
      <div>
        <h1>Checkout</h1>
        <p className="hint" style={{ marginTop: -6 }}>No account needed. You pay in cash when the parcel arrives.</p>

        <section className="panel" aria-labelledby="h-contact" style={{ marginTop: 18 }}>
          <h2 id="h-contact">Delivery details</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" className="input" autoComplete="name" value={form.name} onChange={set('name')} onBlur={blur('name')} aria-invalid={!!show('name')} aria-describedby="name-err" required />
              {show('name') && <span id="name-err" className="error-text">{errors.name}</span>}
            </div>
            <div className="field">
              <label htmlFor="phone">Mobile number</label>
              <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXX-XXXXXX" value={form.phone}
                onChange={set('phone')} onBlur={() => { blur('phone')(); captureCart(); }} aria-invalid={!!show('phone')} aria-describedby="phone-hint" required />
              <span id="phone-hint" className={show('phone') ? 'error-text' : phone ? 'ok-text' : 'hint'}>
                {show('phone') ? errors.phone : phone ? `✓ ${formatBdPhone(phone)}` : 'Bangla or English digits are both fine.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="address">Full address</label>
              <textarea id="address" className="textarea" autoComplete="street-address" placeholder="House, road, area, thana, district (বাংলাতেও লিখতে পারেন)"
                value={form.address} onChange={set('address')} onBlur={() => { blur('address')(); captureCart(); }} aria-invalid={!!show('address')} aria-describedby="address-hint" required />
              <span id="address-hint" className={show('address') ? 'error-text' : 'hint'}>
                {show('address') ? errors.address : quote?.zone ? `Delivery area: ${quote.zone.name}${quote.zone.eta ? ` · ${quote.zone.eta}` : ''}` : 'We use your address to work out the delivery fee.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="email">Email <span className="hint">(optional, for order updates)</span></label>
              <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')} aria-invalid={!!show('email')} />
              {show('email') && <span className="error-text">{errors.email}</span>}
            </div>
            <div className="field">
              <label htmlFor="note">Note for us <span className="hint">(optional)</span></label>
              <input id="note" className="input" maxLength={500} value={form.note} onChange={set('note')} placeholder="e.g. call before delivery" />
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="h-pay" style={{ marginTop: 16 }}>
          <h2 id="h-pay">Payment</h2>
          <label className="pay-option selected">
            <input type="radio" name="payment" value="cod" defaultChecked />
            <span><strong>Cash on Delivery</strong><br /><span className="hint">Pay the rider in cash when your parcel arrives.</span></span>
          </label>
          <label className="pay-option disabled" aria-disabled="true">
            <input type="radio" name="payment" value="mobile" disabled />
            <span><strong>bKash / Nagad</strong> <span className="hint">(coming soon)</span><br /><span className="hint">Not available yet.</span></span>
          </label>
        </section>
      </div>

      <aside className="summary">
        <section className="panel" aria-labelledby="h-summary">
          <h2 id="h-summary">Order summary</h2>
          <CartLines />
          {problems.size > 0 && (
            <div className="alert" role="alert" style={{ marginTop: 12 }}>
              {[...problems.values()].map((l) => (
                <div key={`${l.product_id}${l.variant_id}`}>
                  {l.title || 'An item'}{l.variant_name ? ` (${l.variant_name})` : ''}: {LINE_PROBLEMS[l.problem] || l.problem}
                  {l.problem === 'insufficient_stock' ? ` — only ${l.available} left` : ''}
                </div>
              ))}
              Please update your cart.
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="coupon">Coupon code</label>
            <div className="coupon-row">
              <input id="coupon" className="input" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} autoComplete="off" autoCapitalize="characters" />
              <button type="button" className="btn btn-ghost" onClick={() => setCoupon(couponInput.trim())}>Apply</button>
            </div>
            {coupon && couponState && (
              <span className={couponState.status === 'applied' ? 'ok-text' : 'error-text'} role="status">
                {couponState.status === 'applied'
                  ? `✓ ${couponState.code} applied${couponState.type === 'free_shipping' ? ' (free delivery)' : ''}`
                  : errorMessage(`coupon_${couponState.status}`)}
                {couponState.status === 'min_order' ? ` Minimum ${formatTaka(couponState.min_order)}.` : ''}
              </span>
            )}
            {coupon && quote?.error === 'rate_limited' && <span className="error-text">{errorMessage('rate_limited')}</span>}
          </div>

          <div className="totals" style={{ marginTop: 18 }} aria-live="polite" aria-busy={quoting}>
            <div className="row"><span>Subtotal</span><span>{formatTaka(quote?.subtotal ?? cartSubtotal)}</span></div>
            {quote?.discount > 0 && <div className="row"><span>Discount</span><span>−{formatTaka(quote.discount)}</span></div>}
            <div className="row">
              <span>Delivery{quote?.zone ? ` (${quote.zone.name})` : ''}</span>
              <span>
                {quote?.delivery_fee == null ? <span className="hint">Enter address</span>
                  : quote.delivery_fee === 0
                    ? <><s className="hint">{formatTaka(quote.delivery_fee_original)}</s> Free</>
                    : formatTaka(quote.delivery_fee)}
              </span>
            </div>
            <div className="row grand"><span>Total</span><span>{quote?.total != null ? formatTaka(quote.total) : '—'}</span></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <FreeDeliveryProgress subtotal={(quote?.subtotal ?? cartSubtotal) - (quote?.discount ?? 0)} threshold={quote?.free_shipping_threshold} />
          </div>

          {error && <div className="alert" role="alert" style={{ marginTop: 14 }}>{error}</div>}
          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={submitting || !ready}>
            {submitting ? 'Placing your order…' : `Place order${quote?.total != null ? ` · ${formatTaka(quote.total)}` : ''}`}
          </button>
          <p className="hint" style={{ marginTop: 10, textAlign: 'center' }}>
            We&apos;ll call you to confirm before sending your parcel. By ordering you agree to our <Link href="/terms" style={{ textDecoration: 'underline' }}>terms</Link>.
          </p>
        </section>
      </aside>
    </form>
  );
}
