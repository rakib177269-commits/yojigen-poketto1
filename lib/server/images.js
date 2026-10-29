// Image pipeline: any upload becomes WebP at several widths in the public
// "product-images" bucket, stored as <key>-<width>.webp (see lib/images.js).
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { supabaseService } from './supabase.js';
import { IMAGE_BUCKET } from '../images.js';

export const IMAGE_KINDS = {
  product: { folder: 'products', widths: [400, 800, 1200, 1600] },
  'banner-desktop': { folder: 'banners', widths: [960, 1440, 1920] },
  'banner-mobile': { folder: 'banners', widths: [480, 800, 1080] },
};

export async function processAndStoreImage(input, kind) {
  const spec = IMAGE_KINDS[kind];
  if (!spec) throw new Error('unknown image kind');
  // .rotate() applies the phone's EXIF orientation so photos aren't sideways.
  const base = sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();
  const meta = await base.clone().metadata();
  const sourceWidth = meta.autoOrient?.width ?? meta.width;
  const sourceHeight = meta.autoOrient?.height ?? meta.height;
  if (!sourceWidth || !sourceHeight) throw new Error('not an image');

  // Never upscale: keep only widths the source can fill (always at least one).
  let widths = spec.widths.filter((w) => w <= sourceWidth);
  if (!widths.length) widths = [sourceWidth];

  const key = `${spec.folder}/${randomUUID()}/${randomUUID()}`;
  const storage = supabaseService().storage.from(IMAGE_BUCKET);
  let height = sourceHeight;
  for (const w of widths) {
    const { data, info } = await base.clone().resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 }).toBuffer({ resolveWithObject: true });
    const { error } = await storage.upload(`${key}-${w}.webp`, data, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    if (w === widths.at(-1)) height = info.height;
  }
  return { storage_key: key, widths, width: widths.at(-1), height };
}
