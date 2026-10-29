import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import ProductGallery from '../../../../components/ProductGallery.js';
import AddToCart from '../../../../components/AddToCart.js';
import Price from '../../../../components/Price.js';
import ProductCard from '../../../../components/ProductCard.js';
import { TrackOnMount } from '../../../../components/TrackEvents.js';
import { CashIcon, PhoneIcon, TruckIcon } from '../../../../components/Icons.js';
import { getDeliveryZones, getProduct, getRelated } from '../../../../lib/server/catalog.js';
import { defaultImageUrl } from '../../../../lib/images.js';
import { sanitizeHtml, stripHtml } from '../../../../lib/sanitize.js';
import { formatTaka } from '../../../../lib/format.js';
import { SITE } from '../../../../lib/site.js';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return { title: 'Product not found' };
  const description = (p.seo_description || stripHtml(p.description_html)).slice(0, 160)
    || `${p.title} at ${SITE.name}. Cash on Delivery across Bangladesh.`;
  const image = p.images[0] && new URL(defaultImageUrl(p.images[0].storage_key, p.images[0].widths, 1200), SITE.url).href;
  return {
    title: p.seo_title || p.title,
    description,
    alternates: { canonical: `/p/${p.slug}` },
    openGraph: { title: p.seo_title || p.title, description, url: `/p/${p.slug}`, images: image ? [{ url: image, width: 1200, height: 1200 }] : [] },
  };
}

// JSON-LD must not be able to close its own <script> tag.
const ld = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();
  const [related, zones, nonce] = await Promise.all([
    getRelated(product.id, product.category?.slug ?? null),
    getDeliveryZones(),
    headers().then((h) => h.get('x-nonce') ?? undefined),
  ]);
  const url = `${SITE.url}/p/${product.slug}`;
  const imageUrls = product.images.map((i) => new URL(defaultImageUrl(i.storage_key, i.widths, 1200), SITE.url).href);
  const minFee = zones.length ? Math.min(...zones.map((z) => z.fee)) : null;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description: stripHtml(product.description_html).slice(0, 500) || undefined,
      image: imageUrls,
      sku: product.id,
      url,
      category: product.category?.name,
      brand: { '@type': 'Brand', name: SITE.name },
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'BDT',
        price: product.price,
        availability: product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: SITE.name },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url },
        { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE.url}/shop` },
        ...(product.category ? [{ '@type': 'ListItem', position: 3, name: product.category.name, item: `${SITE.url}/shop/${product.category.slug}` }] : []),
        { '@type': 'ListItem', position: product.category ? 4 : 3, name: product.title, item: url },
      ],
    },
  ];

  return (
    <div className="container" style={{ paddingBottom: 72 }}>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: ld(jsonLd) }} />
      <TrackOnMount event="ViewContent" data={{ content_ids: [product.id], content_name: product.title, content_type: 'product', value: product.price, currency: 'BDT' }} />

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span aria-hidden="true">/</span>
        <Link href="/shop">Shop</Link>
        {product.category && <><span aria-hidden="true">/</span><Link href={`/shop/${product.category.slug}`}>{product.category.name}</Link></>}
      </nav>

      <div className="pdp">
        <ProductGallery
          images={product.images}
          title={product.title}
          badge={product.is_sample ? <span className="tag-sample">Sample product</span> : null}
        />
        <div className="pdp-info">
          <h1>{product.title}</h1>
          <Price price={product.price} compareAt={product.compare_at_price} showOff />
          <AddToCart product={product} />
          <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description_html) }} />
          <ul className="perks">
            <li><CashIcon /> Cash on Delivery: pay when your parcel arrives.</li>
            <li><TruckIcon /> Delivery {minFee != null ? `from ${formatTaka(minFee)}` : ''}: {zones.map((z) => `${z.name} ${z.eta ? `(${z.eta})` : ''}`).join(' · ')}. <Link href="/shipping" style={{ textDecoration: 'underline' }}>Details</Link></li>
            <li><PhoneIcon /> Questions? Call or WhatsApp <a href={`tel:${SITE.phoneIntl}`}>{SITE.phone}</a></li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section" aria-labelledby="related" style={{ paddingTop: 16 }}>
          <div className="section-head"><h2 id="related">You may also like</h2></div>
          <div className="grid">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </div>
  );
}
