// Staff image upload (admin + manager). The browser has already shrunk the photo;
// here it becomes WebP in several sizes. The product/banner row that references
// it is saved separately through a role-checked database function.
import { getStaff } from '../../../../lib/server/auth.js';
import { IMAGE_KINDS, processAndStoreImage } from '../../../../lib/server/images.js';

export const maxDuration = 26;
const MAX_BYTES = 5_500_000; // Netlify's request limit is 6 MB

export async function POST(request) {
  const staff = await getStaff();
  if (!staff || !['admin', 'manager'].includes(staff.role)) {
    return Response.json({ error: 'Not allowed' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('kind') ?? 'product');
  if (!file || typeof file === 'string') return Response.json({ error: 'No file' }, { status: 400 });
  if (!IMAGE_KINDS[kind]) return Response.json({ error: 'Unknown kind' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'File too large (max 5.5 MB)' }, { status: 413 });
  try {
    const image = await processAndStoreImage(Buffer.from(await file.arrayBuffer()), kind);
    return Response.json({ ok: true, image });
  } catch (err) {
    console.error('upload failed:', err.message);
    const unreadable = /unsupported|not an image|Input buffer/i.test(err.message);
    return Response.json({ error: unreadable ? 'That file is not a photo we can read (use JPG, PNG or WebP).' : 'Upload failed. Please try again.' },
      { status: unreadable ? 415 : 500 });
  }
}
