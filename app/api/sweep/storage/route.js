// Nightly (pg_cron, 03:17 UTC): remove uploaded image files that no product or
// banner uses any more. Called with a shared secret that lives in Supabase Vault.
// Safe to run twice: the second run finds nothing to delete.
import { timingSafeEqual } from 'node:crypto';
import { supabaseService } from '../../../../lib/server/supabase.js';
import { IMAGE_BUCKET } from '../../../../lib/images.js';

let cachedSecret;
async function sweepSecret(db) {
  if (!cachedSecret) {
    const { data, error } = await db.rpc('get_sweep_secret');
    if (error || !data) throw new Error('sweep secret unavailable');
    cachedSecret = data;
  }
  return cachedSecret;
}

export async function POST(request) {
  const db = supabaseService();
  const given = Buffer.from(request.headers.get('x-sweep-secret') ?? '');
  const expected = Buffer.from(await sweepSecret(db));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data: files, error } = await db.rpc('sweep_orphan_image_files', { p_limit: 500 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let removed = 0;
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { error: rmError } = await db.storage.from(IMAGE_BUCKET).remove(batch);
    if (rmError) return Response.json({ error: rmError.message, removed }, { status: 500 });
    removed += batch.length;
  }
  console.log(`storage sweep removed ${removed} orphan file(s)`);
  return Response.json({ ok: true, removed });
}
