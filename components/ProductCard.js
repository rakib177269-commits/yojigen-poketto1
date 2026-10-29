import Link from 'next/link';
import ProductImage from './ProductImage.js';
import Price from './Price.js';
import WishlistButton from './WishlistButton.js';
import { discountPercent } from '../lib/format.js';

export default function ProductCard({ product, priority = false }) {
  const off = discountPercent(product.price, product.compare_at_price);
  const snapshot = {
    id: product.id, slug: product.slug, title: product.title, price: product.price,
    image_key: product.image_key, image_widths: product.image_widths,
  };
  return (
    <article className="card">
      <div className="media">
        {!product.in_stock ? <span className="tag soldout">Sold out</span>
          : off > 0 ? <span className="tag sale">−{off}%</span> : null}
        {product.is_sample && <span className="tag-sample">Sample</span>}
        <ProductImage
          imageKey={product.image_key}
          widths={product.image_widths}
          width={product.image_width}
          height={product.image_height}
          alt={product.image_alt || product.title}
          sizes="(min-width: 1100px) 280px, (min-width: 768px) 33vw, 50vw"
          priority={priority}
        />
      </div>
      <WishlistButton product={snapshot} className="icon-btn wish" />
      {product.category_name && <span className="cat">{product.category_name}</span>}
      <h3 className="title"><Link href={`/p/${product.slug}`}>{product.title}</Link></h3>
      <Price price={product.price} compareAt={product.compare_at_price} />
    </article>
  );
}
