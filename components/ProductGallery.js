'use client';
import { useState } from 'react';
import ProductImage from './ProductImage.js';

export default function ProductGallery({ images, title, badge }) {
  const [index, setIndex] = useState(0);
  const current = images[index];
  return (
    <div>
      <div className="gallery-main">
        {badge}
        {current ? (
          <ProductImage
            imageKey={current.storage_key}
            widths={current.widths}
            width={current.width}
            height={current.height}
            alt={current.alt || title}
            sizes="(min-width: 900px) 55vw, 100vw"
            priority={index === 0}
          />
        ) : null}
      </div>
      {images.length > 1 && (
        <div className="thumbs" role="group" aria-label="Product photos">
          {images.map((img, i) => (
            <button key={img.id} type="button" aria-current={i === index} aria-label={`Show photo ${i + 1} of ${images.length}`} onClick={() => setIndex(i)}>
              <ProductImage imageKey={img.storage_key} widths={img.widths} alt="" sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
