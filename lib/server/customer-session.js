// Customer sessions: a cookie holding {customer id, phone, expiry}, signed with
// HMAC-SHA256 using a secret kept in Supabase Vault. HttpOnly, so page scripts
// can't read it; 30 days; signing out deletes it.
import { cookies } from 'next/headers';
import { supabaseService } from './supabase.js';
import { signSession, verifySession } from './session-token.js';

export const SESSION_COOKIE = 'yp_session';
const MAX_AGE = 30 * 24 * 3600;

let cachedSecret;
async function secret() {
  if (!cachedSecret) {
    const { data, error } = await supabaseService().rpc('get_customer_session_secret');
    if (error || !data) throw new Error('customer session secret unavailable');
    cachedSecret = data;
  }
  return cachedSecret;
}

// { customerId, phone } or null.
export async function getCustomer() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const p = verifySession(token, await secret());
    return p ? { customerId: p.c, phone: p.p } : null;
  } catch {
    return null;
  }
}

export async function startSession(customerId, phone) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  (await cookies()).set(SESSION_COOKIE, signSession({ c: customerId, p: phone, exp }, await secret()), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
