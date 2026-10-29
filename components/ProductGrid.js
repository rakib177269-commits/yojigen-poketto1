'use client';
// Server renders the first page; this loads the next pages as the visitor scrolls.
import { useEffect, useRef, useState } from 'react';
import ProductCard from './ProductCard.js';

export default function ProductGrid({ initialItems, initialHasMore, query }) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef(null);

  // New filters => new server render => reset.
  useEffect(() => { setItems(initialItems); setHasMore(initialHasMore); }, [initialItems, initialHasMore]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams(query);
      params.set('offset', String(items.length));
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems((current) => {
        const seen = new Set(current.map((p) => p.id));
        return current.concat(data.items.filter((p) => !seen.has(p.id)));
      });
      setHasMore(data.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasMore || !sentinel.current) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '600px 0px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  });

  return (
    <>
      <div className="grid">
        {items.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />)}
      </div>
      {hasMore && (
        <div className="load-more" ref={sentinel}>
          <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : failed ? 'Try again' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
}
