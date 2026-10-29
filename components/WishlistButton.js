'use client';
import { useStore } from './StoreProvider.js';
import { HeartIcon } from './Icons.js';
import { track } from '../lib/track.js';

export default function WishlistButton({ product, className = 'icon-btn', withLabel = false }) {
  const { isWishlisted, toggleWishlist, ready } = useStore();
  const on = ready && isWishlisted(product.id);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={on}
      aria-label={on ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
      onClick={() => {
        if (toggleWishlist(product)) {
          track('AddToWishlist', { content_ids: [product.id], content_name: product.title, value: product.price, currency: 'BDT', content_type: 'product' });
        }
      }}
    >
      <HeartIcon filled={on} style={{ color: on ? 'var(--blue)' : undefined }} />
      {withLabel && <span>{on ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
