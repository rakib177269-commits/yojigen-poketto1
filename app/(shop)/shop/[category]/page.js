import { notFound } from 'next/navigation';
import ShopView from '../../../../components/ShopView.js';
import { getCategories } from '../../../../lib/server/catalog.js';

export async function generateMetadata({ params }) {
  const { category } = await params;
  const c = (await getCategories()).find((x) => x.slug === category);
  if (!c) return {};
  return {
    title: c.name,
    description: c.description || `Shop ${c.name} at Yojigen Poketto. Cash on Delivery across Bangladesh.`,
    alternates: { canonical: `/shop/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }) {
  const { category } = await params;
  if (!(await getCategories()).some((c) => c.slug === category)) notFound();
  return <ShopView searchParams={await searchParams} categorySlug={category} />;
}
