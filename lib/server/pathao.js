// Pathao merchant API (courier). Server-only: every value below is a secret
// read from Netlify's environment, never sent to the browser.
// The access token is kept in the database so every serverless function shares it.
import { supabaseService } from './supabase.js';

const PROVIDER = 'pathao';
const BASE = (process.env.PATHAO_BASE_URL || 'https://api-hermes.pathao.com').trim().replace(/\/$/, '');
// Values pasted into Netlify often carry an invisible space or line break: ignore it.
const env = (name) => (process.env[name] ?? '').trim();
const MERCHANT_BASE = 'https://merchant.pathao.com';
const TIMEOUT_MS = 15_000;

export const NORMAL_DELIVERY = 48;
export const PARCEL = 2;

export function pathaoConfigured() {
  return Boolean(env('PATHAO_CLIENT_ID') && env('PATHAO_CLIENT_SECRET'));
}

// What's set (never the values), for the settings page.
export function pathaoEnvStatus() {
  return {
    client: pathaoConfigured(),
    login: Boolean(env('PATHAO_USERNAME') && env('PATHAO_PASSWORD')),
    webhook: Boolean(env('PATHAO_WEBHOOK_SECRET')),
    sandbox: BASE.includes('sandbox'),
  };
}

export class PathaoError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Pathao answers errors as { message, errors: { field: ["..."] } }.
function errorFrom(status, body) {
  const fields = body?.errors && typeof body.errors === 'object' ? body.errors : null;
  const detail = fields ? Object.values(fields).flat().filter((x) => typeof x === 'string').join(' ') : '';
  const msg = [body?.message, detail].filter(Boolean).join(': ') || `Pathao answered ${status}`;
  return new PathaoError(msg.slice(0, 400), status, fields);
}

async function call(url, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    throw new PathaoError(err.name === 'TimeoutError' ? 'Pathao did not answer in time. Please try again.' : 'Could not reach Pathao.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw errorFrom(res.status, data);
  return data;
}

async function issueToken(refreshToken) {
  const base = { client_id: env('PATHAO_CLIENT_ID'), client_secret: env('PATHAO_CLIENT_SECRET') };
  if (refreshToken) {
    return call(`${BASE}/aladdin/api/v1/issue-token`, { method: 'POST', body: { ...base, grant_type: 'refresh_token', refresh_token: refreshToken } });
  }
  if (env('PATHAO_USERNAME') && env('PATHAO_PASSWORD')) {
    return call(`${BASE}/aladdin/api/v1/issue-token`, { method: 'POST', body: {
      ...base, grant_type: 'password', username: env('PATHAO_USERNAME'), password: env('PATHAO_PASSWORD'),
    } });
  }
  // Newer merchant accounts: client id + secret only.
  return call(`${BASE}/aladdin/api/v1/external/login`, { method: 'POST', body: base });
}

async function token({ fresh = false } = {}) {
  if (!pathaoConfigured()) throw new PathaoError('Pathao is not connected yet (API keys missing).', 0);
  const db = supabaseService();
  const { data: saved } = await db.rpc('courier_get_token', { p_provider: PROVIDER });
  if (!fresh && saved && new Date(saved.expires_at) > new Date(Date.now() + 5 * 60_000)) return saved.access_token;

  let data;
  try {
    data = await issueToken(saved?.refresh_token);
  } catch (err) {
    if (!saved?.refresh_token) throw err;
    data = await issueToken(null); // refresh token expired: log in again
  }
  if (!data?.access_token) throw new PathaoError('Pathao did not return an access token. Check the API keys.', 0);
  await db.rpc('courier_save_token', {
    p_provider: PROVIDER, p_access: data.access_token, p_refresh: data.refresh_token ?? null, p_expires_in: data.expires_in ?? 3600,
  });
  return data.access_token;
}

// Authenticated request; one retry with a new token if Pathao says the old one is invalid.
async function api(path, { method = 'GET', body, merchant = false } = {}) {
  const url = `${merchant ? MERCHANT_BASE : BASE}${path}`;
  try {
    return await call(url, { method, body, token: await token() });
  } catch (err) {
    if (err.status !== 401) throw err;
    return call(url, { method, body, token: await token({ fresh: true }) });
  }
}

const list = (res) => res?.data?.data ?? res?.data ?? [];

export const pathao = {
  stores: async () => list(await api('/aladdin/api/v1/stores')),
  cities: async () => list(await api('/aladdin/api/v1/city-list')),
  zones: async (cityId) => list(await api(`/aladdin/api/v1/cities/${Number(cityId)}/zone-list`)),
  areas: async (zoneId) => list(await api(`/aladdin/api/v1/zones/${Number(zoneId)}/area-list`)),

  // Returns { consignment_id, delivery_fee, order_status }.
  createOrder: async (order) => {
    const res = await api('/aladdin/api/v1/orders', { method: 'POST', body: order });
    if (!res?.data?.consignment_id) throw new PathaoError(res?.message || 'Pathao did not return a consignment number.', 0);
    return res.data;
  },

  orderInfo: async (consignmentId) => (await api(`/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`))?.data ?? null,

  // Delivery history of a phone number across all Pathao merchants.
  customerHistory: async (phone) => (await api('/api/v1/user/success', { method: 'POST', body: { phone }, merchant: true }))?.data ?? null,
};

// Pathao's history answer, reduced to what the order page shows. Unknown shapes stay null.
export function summarizeHistory(data) {
  const c = data?.customer ?? data ?? {};
  const total = Number(c.total_delivery ?? c.total_parcel ?? c.total);
  const success = Number(c.successful_delivery ?? c.success_parcel ?? c.successful);
  if (!Number.isFinite(total)) return null;
  return {
    total,
    successful: Number.isFinite(success) ? success : null,
    rate: Number.isFinite(success) && total > 0 ? Math.round((100 * success) / total) : null,
    rating: typeof data?.customer_rating === 'string' ? data.customer_rating.replace(/_/g, ' ') : null,
  };
}

// For the health check: shape of the settings, never their values.
export function pathaoEnvShape() {
  const raw = (n) => process.env[n] ?? '';
  const user = env('PATHAO_USERNAME');
  return {
    extra_spaces: ['PATHAO_CLIENT_ID', 'PATHAO_CLIENT_SECRET', 'PATHAO_USERNAME', 'PATHAO_PASSWORD']
      .filter((n) => raw(n) !== raw(n).trim()),
    username_looks_like: !user ? 'missing' : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user) ? 'email'
      : /^(\+?88)?01[3-9]\d{8}$/.test(user.replace(/[\s-]/g, '')) ? 'phone' : 'something else',
    username_has_capitals: /[A-Z]/.test(user),
    client_id_length: env('PATHAO_CLIENT_ID').length,
    // A client id is a public identifier (unlike the secret): its ends tell which one is in use.
    client_id_hint: env('PATHAO_CLIENT_ID') ? `${env('PATHAO_CLIENT_ID').slice(0, 3)}…${env('PATHAO_CLIENT_ID').slice(-2)}` : null,
    client_secret_length: env('PATHAO_CLIENT_SECRET').length,
  };
}
