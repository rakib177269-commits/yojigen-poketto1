import ShopView from '../../../components/ShopView.js';

export async function generateMetadata({ searchParams }) {
  const { q } = await searchParams;
  return {
    title: q ? `Search: ${String(q).slice(0, 60)}` : 'Shop all products',
    description: 'Gadgets, gifts, cute items and accessories with Cash on Delivery across Bangladesh.',
    alternates: { canonical: '/shop' },
    // Filtered and search result pages shouldn't compete with the main listing.
    robots: q ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }) {
  return <ShopView searchParams={await searchParams} />;
}
