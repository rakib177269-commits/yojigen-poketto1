// Background jobs (pg_cron -> /api/sweep/*) prove themselves with a shared
// secret kept in Supabase Vault, sent as the x-sweep-secret header.
import { timingSafeEqual } from 'node:crypto';

let cachedSecret;

export async function sweepAllowed(request, db) {
  if (!cachedSecret) {
    const { data, error } = await db.rpc('get_sweep_secret');
    if (error || !data) throw new Error('sweep secret unavailable');
    cachedSecret = data;
  }
  const given = Buffer.from(request.headers.get('x-sweep-secret') ?? '');
  const expected = Buffer.from(cachedSecret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
