import { imageSrcSet, defaultImageUrl } from '../lib/images.js';

// Responsive WebP <img>. The product is never cropped: object-fit: contain on a
// neutral background (set in CSS on the container).
export default function ProductImage({ imageKey, widths, width, height, alt, sizes, priority = false, className }) {
  const src = defaultImageUrl(imageKey, widths);
  if (!src) return <div className={className} aria-hidden="true" />;
  return (
    <img
      className={className}
      src={src}
      srcSet={imageSrcSet(imageKey, widths)}
      sizes={sizes}
      width={width || 1200}
      height={height || 1200}
      alt={alt || ''}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
    />
  );
}
