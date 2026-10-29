'use client';
import Link from 'next/link';
import { useStore, lineKey } from './StoreProvider.js';
import { CloseIcon } from './Icons.js';
import ProductImage from './ProductImage.js';
import { formatTaka } from '../lib/format.js';

export function FreeDeliveryProgress({ subtotal, threshold }) {
  if (!threshold) return null;
  const remaining = threshold - subtotal;
  const pct = Math.max(0, Math.min(100, (subtotal / threshold) * 100));
  return (
    <div className="free-progress">
      {remaining > 0
        ? <>Add <strong>{formatTaka(remaining)}</strong> more for free delivery.</>
        : <>You get <strong>free delivery</strong>.</>}
      <div className="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function CartLines({ editable = true }) {
  const { cart, setQty } = useStore();
  return cart.map((l) => (
    <div className="line" key={lineKey(l)}>
      <div className="thumb">
        <ProductImage imageKey={l.image_key} widths={l.image_widths} alt="" sizes="72px" />
      </div>
      <div>
        <Link className="name" href={`/p/${l.slug}`}>{l.title}</Link>
        {l.variantName && <div className="meta">Colour: {l.variantName}</div>}
        <div className="meta">{formatTaka(l.price)}</div>
        {editable && (
          <div className="qty" role="group" aria-label={`Quantity of ${l.title}`}>
            <button type="button" aria-label="Decrease quantity" onClick={() => setQty(lineKey(l), l.qty - 1)}>−</button>
            <span aria-live="polite">{l.qty}</span>
            <button type="button" aria-label="Increase quantity" onClick={() => setQty(lineKey(l), l.qty + 1)}>+</button>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 600 }}>{formatTaka(l.price * l.qty)}</div>
        {editable && <button type="button" className="remove" onClick={() => setQty(lineKey(l), 0)}>Remove</button>}
      </div>
    </div>
  ));
}

export default function CartDrawer({ freeShippingThreshold }) {
  const { cart, cartDialog, cartSubtotal, closeCart, ready } = useStore();
  return (
    <dialog
      ref={cartDialog}
      className="drawer right"
      aria-labelledby="cart-title"
      onClick={(e) => { if (e.target === e.currentTarget) closeCart(); }}
    >
      <div className="drawer-inner">
        <div className="drawer-head">
          <h2 id="cart-title">Your cart</h2>
          <button type="button" className="icon-btn" aria-label="Close cart" onClick={closeCart}><CloseIcon /></button>
        </div>
        <div className="drawer-body">
          {ready && cart.length === 0 ? (
            <div className="empty">
              <p>Your cart is empty.</p>
              <Link href="/shop" className="btn btn-ghost" onClick={closeCart}>Browse the shop</Link>
            </div>
          ) : <CartLines />}
        </div>
        {cart.length > 0 && (
          <div className="drawer-foot">
            <FreeDeliveryProgress subtotal={cartSubtotal} threshold={freeShippingThreshold} />
            <div className="totals">
              <div className="row"><span>Subtotal</span><strong>{formatTaka(cartSubtotal)}</strong></div>
              <div className="hint">Delivery is calculated at checkout from your address.</div>
            </div>
            <Link href="/checkout" className="btn btn-primary btn-block" onClick={closeCart}>Checkout · Cash on Delivery</Link>
            <button type="button" className="btn btn-ghost btn-block" onClick={closeCart}>Continue shopping</button>
          </div>
        )}
      </div>
    </dialog>
  );
}
