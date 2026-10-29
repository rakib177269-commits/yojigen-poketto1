'use client';
import { useState } from 'react';
import { useStore } from './StoreProvider.js';
import WishlistButton from './WishlistButton.js';
import { formatTaka } from '../lib/format.js';
import { track } from '../lib/track.js';

export default function AddToCart({ product }) {
  const { addToCart, openCart } = useStore();
  const variants = product.variants;
  const firstAvailable = variants.find((v) => v.stock > 0);
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? null);
  const [qty, setQty] = useState(1);
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const stock = variants.length ? (variant?.stock ?? 0) : product.stock;
  const soldOut = stock <= 0;
  const firstImage = product.images[0];

  function add() {
    if (soldOut) return;
    addToCart({
      productId: product.id,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      slug: product.slug,
      title: product.title,
      price: product.price,
      image_key: firstImage?.storage_key ?? null,
      image_widths: firstImage?.widths ?? [],
    }, qty);
    track('AddToCart', {
      content_ids: [product.id], content_name: product.title, content_type: 'product',
      value: product.price * qty, currency: 'BDT', num_items: qty,
    });
    openCart();
  }

  const stockLabel = soldOut ? 'Sold out' : stock <= 3 ? `Only ${stock} left` : 'In stock';

  return (
    <div>
      {variants.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: '18px 0 0' }}>
          <legend className="label">Colour{variant ? `: ${variant.name}` : ''}</legend>
          <div className="swatches">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className="swatch"
                aria-pressed={v.id === variantId}
                disabled={v.stock <= 0}
                onClick={() => { setVariantId(v.id); setQty(1); }}
              >
                <span className="dot" style={{ background: v.color_hex || '#ccd' }} aria-hidden="true" />
                {v.name}{v.stock <= 0 && <span className="sr-only"> (sold out)</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className={`stock ${soldOut ? 'out' : stock <= 3 ? 'low' : ''}`} style={{ marginTop: 14 }}>{stockLabel}</p>

      <div className="buy-row">
        <div className="qty" role="group" aria-label="Quantity">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={soldOut}>−</button>
          <output aria-live="polite">{qty}</output>
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(Math.max(stock, 1), 20, q + 1))} disabled={soldOut}>+</button>
        </div>
        <button type="button" className="btn btn-primary" onClick={add} disabled={soldOut}>
          {soldOut ? 'Sold out' : 'Add to cart'}
        </button>
        <WishlistButton product={{ id: product.id, slug: product.slug, title: product.title, price: product.price, image_key: firstImage?.storage_key, image_widths: firstImage?.widths }} className="icon-btn" />
      </div>

      <div className="sticky-buy" aria-hidden="true">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.title}</div>
          <strong>{formatTaka(product.price)}</strong>
        </div>
        <button type="button" className="btn btn-primary" onClick={add} disabled={soldOut} tabIndex={-1}>
          {soldOut ? 'Sold out' : 'Add to cart'}
        </button>
      </div>
    </div>
  );
}
