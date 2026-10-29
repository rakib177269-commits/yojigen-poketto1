// Signed session tokens: base64url(JSON) + "." + HMAC-SHA256. Pure functions
// (no Next.js imports) so they can be unit-tested.
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (s) => Buffer.from(s).toString('base64url');

export function signSession(payload, key) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}

export function verifySession(token, key, now = Date.now()) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac('sha256', key).update(body).digest('base64url'));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p && typeof p.c === 'string' && typeof p.exp === 'number' && p.exp * 1000 > now ? p : null;
  } catch {
    return null;
  }
}

