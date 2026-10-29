import StoreProvider from '../../components/StoreProvider.js';
import HeaderClient from '../../components/HeaderClient.js';
import CartDrawer from '../../components/CartDrawer.js';
import Footer from '../../components/Footer.js';
import Attribution from '../../components/Attribution.js';
import { getCategories, getSettings } from '../../lib/server/catalog.js';
import { formatTaka } from '../../lib/format.js';

export default async function ShopLayout({ children }) {
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  const threshold = settings?.free_shipping_threshold ?? null;
  return (
    <StoreProvider>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="announce">
        {threshold ? <>Free delivery on orders over {formatTaka(threshold)} · </> : null}
        Cash on Delivery all over Bangladesh
      </div>
      <HeaderClient categories={categories.map(({ name, slug }) => ({ name, slug }))} />
      <main id="main">{children}</main>
      <Footer categories={categories} />
      <CartDrawer freeShippingThreshold={threshold} />
      <Attribution />
    </StoreProvider>
  );
}
