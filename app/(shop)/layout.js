import StoreProvider from '../../components/StoreProvider.js';
import HeaderClient from '../../components/HeaderClient.js';
import CartDrawer from '../../components/CartDrawer.js';
import Footer from '../../components/Footer.js';
import Attribution from '../../components/Attribution.js';
import Pixels from '../../components/Pixels.js';
import { getCategories, getSettings } from '../../lib/server/catalog.js';
import { formatTaka } from '../../lib/format.js';
import { getStaff } from '../../lib/server/auth.js';
import { SITE } from '../../lib/site.js';

export default async function ShopLayout({ children }) {
  const [categories, settings] = await Promise.all([getCategories(), getSettings()]);
  const threshold = settings?.free_shipping_threshold ?? null;

  // Maintenance mode: visitors get a holding page; signed-in staff still see the shop.
  if (settings?.maintenance_mode && !(await getStaff())) {
    return (
      <main className="maintenance">
        <div>
          <p className="wordmark-main">Yojigen Poketto</p>
          <h1>We’ll be back soon</h1>
          <p>We’re updating the shop. Please check back in a little while.</p>
          <p>Need something now? Call or WhatsApp <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a>.</p>
        </div>
      </main>
    );
  }
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
      <Pixels tracking={settings?.integrations?.tracking} />
    </StoreProvider>
  );
}
