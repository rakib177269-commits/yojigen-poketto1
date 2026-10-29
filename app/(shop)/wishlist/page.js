import WishlistView from '../../../components/WishlistView.js';

export const metadata = { title: 'Wishlist', robots: { index: false, follow: true } };

export default function WishlistPage() {
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="shop-head"><h1>Wishlist</h1><p className="hint">Saved on this device.</p></div>
      <WishlistView />
    </div>
  );
}
