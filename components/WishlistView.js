'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from './StoreProvider.js';
import ProductCard from './ProductCard.js';

export default function WishlistView() {
  const { wishlist, ready } = useStore();
  const [items, setItems] = useState(null);
  const ids = wishlist.map((p) => p.id).join(',');

  // Fresh prices and stock from the catalogue; hidden/deleted products drop out.
  useEffect(() => {
    if (!ready) return;
    if (!ids) { setItems([]); return; }
    fetch(`/api/products?ids=${ids}`).then((r) => r.json()).then((d) => {
      const byId = new Map(d.items.map((p) => [p.id, p]));
      setItems(ids.split(',').map((id) => byId.get(id)).filter(Boolean));
    }).catch(() => setItems([]));
  }, [ready, ids]);

  if (!ready || items === null) return <p className="empty">Loading your wishlist…</p>;
  if (!items.length) {
    return (
      <div className="empty">
        <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
        <Link href="/shop" className="btn btn-ghost">Browse the shop</Link>
      </div>
    );
  }
  return <div className="grid">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}
