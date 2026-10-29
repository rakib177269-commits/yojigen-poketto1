import Link from 'next/link';
import ProductCard from '../../components/ProductCard.js';
import ProductImage from '../../components/ProductImage.js';
import { getBanners, getBestSellers, getCategories, getNewArrivals } from '../../lib/server/catalog.js';
import { imageSrcSet, defaultImageUrl } from '../../lib/images.js';
import { SITE } from '../../lib/site.js';

export const metadata = { alternates: { canonical: '/' } };

function Banner({ banner, priority }) {
  const inner = (
    <picture>
      {/* Separate crops so faces are never cut off: mobile is portrait, desktop is wide. */}
      <source media="(min-width: 768px)" srcSet={imageSrcSet(banner.desktop_key, banner.desktop_widths)} sizes="100vw" />
      <img
        src={defaultImageUrl(banner.mobile_key, banner.mobile_widths, 800)}
        srcSet={imageSrcSet(banner.mobile_key, banner.mobile_widths)}
        sizes="100vw"
        width={banner.mobile_width || 800}
        height={banner.mobile_height || 1000}
        alt={banner.alt || banner.title}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
      />
    </picture>
  );
  const copy = (banner.title || banner.subtitle) && (
    <div className="banner-copy">
      {banner.title && <h2>{banner.title}</h2>}
      {banner.subtitle && <p>{banner.subtitle}</p>}
    </div>
  );
  return banner.link_url
    ? <Link className="banner" href={banner.link_url}>{inner}{copy}</Link>
    : <div className="banner">{inner}{copy}</div>;
}

export default async function HomePage() {
  const [banners, categories, newArrivals, bestSellers] = await Promise.all([
    getBanners(), getCategories(), getNewArrivals(8), getBestSellers(8),
  ]);
  const featured = categories.filter((c) => c.is_featured);
  // Category tiles use the newest product photo in that category.
  const tileImage = (slug) => newArrivals.find((p) => p.category_slug === slug && p.image_key);

  return (
    <>
      {banners.length > 0 ? (
        <section aria-label="Featured">
          {banners.slice(0, 1).map((b) => <Banner key={b.id} banner={b} priority />)}
        </section>
      ) : (
        <section className="hero">
          <div className="hero-decor" />
          <div className="container"><div className="hero-text">
            <span className="eyebrow">New season · Cash on Delivery</span>
            <h1>Little wonders for every pocket.</h1>
            <p>{SITE.tagline} Handpicked gadgets, thoughtful gifts and cute accessories.</p>
            <div className="hero-actions">
              <Link href="/shop" className="btn btn-primary">Shop now</Link>
              <Link href="/shop?sort=new" className="btn btn-ghost">New arrivals</Link>
            </div>
          </div></div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="section container" aria-labelledby="cats">
          <div className="section-head">
            <h2 id="cats">Shop by category</h2>
            <Link href="/shop">View all</Link>
          </div>
          <div className="cat-grid">
            {featured.map((c) => {
              const p = tileImage(c.slug);
              return (
                <Link key={c.slug} href={`/shop/${c.slug}`} className="cat-tile">
                  <div className="media">
                    {p && <ProductImage imageKey={p.image_key} widths={p.image_widths} alt="" sizes="(min-width: 768px) 25vw, 50vw" />}
                  </div>
                  <span className="label">{c.name} <span aria-hidden="true">→</span></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section container" aria-labelledby="new" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2 id="new">New arrivals</h2>
          <Link href="/shop?sort=new">See more</Link>
        </div>
        {newArrivals.length ? (
          <div className="grid">
            {newArrivals.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />)}
          </div>
        ) : <p className="empty">New products are on their way.</p>}
      </section>

      {bestSellers.length > 0 && (
        <section className="section container" aria-labelledby="best" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <h2 id="best">Best sellers</h2>
            <Link href="/shop?sort=popular">See more</Link>
          </div>
          <div className="grid">
            {bestSellers.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </>
  );
}
