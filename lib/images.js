// Product and banner images are stored as WebP at several widths:
//   <key>-<width>.webp
// The key is either a Supabase Storage path in the public "product-images"
// bucket, or a site path starting with "/" (bundled sample images).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const IMAGE_BUCKET = 'product-images';

export function imageUrl(key, width) {
  if (!key) return null;
  const file = `${key}-${width}.webp`;
  if (key.startsWith('/')) return file;
  return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${file}`;
}

export function imageSrcSet(key, widths) {
  if (!key || !widths?.length) return undefined;
  return [...widths].sort((a, b) => a - b).map((w) => `${imageUrl(key, w)} ${w}w`).join(', ');
}

// A sensible default src: the smallest width that is at least `target`.
export function defaultImageUrl(key, widths, target = 800) {
  if (!key || !widths?.length) return null;
  const sorted = [...widths].sort((a, b) => a - b);
  return imageUrl(key, sorted.find((w) => w >= target) ?? sorted.at(-1));
}
