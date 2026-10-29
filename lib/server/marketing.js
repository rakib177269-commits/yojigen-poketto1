// Server-side marketing events: Meta Conversions API and GA4 Measurement Protocol. Tokens are server-only secrets; pixel/measurement ids are
// public and come from Settings (store_settings.integrations.tracking).
//
// Purchase is only ever built here, from a confirmed order (see the sweep).
import { createHash } from 'node:crypto';

const META_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const TIMEOUT_MS = 10_000;

export const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const hashed = (v) => (v ? sha256(String(v).trim().toLowerCase()) : undefined);

// Which vendors can send server events right now.
export function serverVendors(tracking) {
  const t = tracking ?? {};
  return {
    meta: Boolean(t.meta_pixel_id && process.env.META_CAPI_TOKEN),
    ga4: Boolean(t.ga4_id && process.env.GA4_API_SECRET),
  };
}

export function tokenStatus() {
  return {
    meta: Boolean(process.env.META_CAPI_TOKEN),
    metaTest: Boolean(process.env.META_TEST_EVENT_CODE),
    ga4: Boolean(process.env.GA4_API_SECRET),
  };
}

// Customer details in the form vendors match on (hashed, normalised).
// phone is stored as 8801XXXXXXXXX already.
export function customerKeys(order) {
  const parts = String(order.name ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return {
    ph: order.phone ? sha256(order.phone) : undefined,
    em: hashed(order.email),
    fn: parts.length ? sha256(parts[0]) : undefined,
    ln: parts.length > 1 ? sha256(parts.at(-1)) : undefined,
    ct: ['dhaka_inside', 'dhaka_outskirts'].includes(order.zone_code) ? sha256('dhaka') : undefined,
    country: sha256('bd'),
    external_id: order.phone ? sha256(order.phone) : undefined,
  };
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

async function post(url, body, headers = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'timeout' : 'network error' };
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* GA4 answers with an empty body */ }
  if (!res.ok) return { ok: false, error: (data?.error?.message || data?.message || `HTTP ${res.status}`).slice(0, 200) };
  return { ok: true, data };
}

// ---------------------------------------------------------------- Meta
export async function sendMeta(pixelId, events) {
  // Token in the body, not the URL, so it never ends up in a logged URL.
  const body = { data: events, access_token: process.env.META_CAPI_TOKEN };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  return post(`https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(pixelId)}/events`, body);
}

// When the customer actually ordered, if the vendor still accepts that time
// (Meta: 7 days, GA4: 3 days); otherwise "now". Ad attribution counts from the click.
export function eventTime(order, maxAgeHours) {
  const placed = new Date(order.created_at).getTime();
  return Date.now() - placed < (maxAgeHours - 2) * 3600_000 ? placed : Date.now();
}

export function metaPurchase(order, siteUrl) {
  const k = customerKeys(order);
  return {
    event_name: 'Purchase',
    event_id: `purchase-${order.code}`,
    event_time: Math.floor(eventTime(order, 7 * 24) / 1000),
    action_source: 'website',
    event_source_url: order.landing_url || siteUrl,
    user_data: clean({
      ph: k.ph ? [k.ph] : undefined, em: k.em ? [k.em] : undefined, fn: k.fn ? [k.fn] : undefined,
      ln: k.ln ? [k.ln] : undefined, ct: k.ct ? [k.ct] : undefined, country: [k.country],
      external_id: k.external_id ? [k.external_id] : undefined,
      client_ip_address: order.client_ip, client_user_agent: order.client_user_agent,
      fbp: order.fbp, fbc: order.fbc,
    }),
    custom_data: {
      currency: 'BDT',
      value: order.total,
      order_id: order.code,
      content_type: 'product',
      content_ids: [...new Set(order.items.map((i) => i.product_id).filter(Boolean))],
      contents: order.items.map((i) => ({ id: i.product_id, quantity: i.quantity, item_price: i.unit_price })),
      num_items: order.items.reduce((n, i) => n + i.quantity, 0),
    },
  };
}

// ---------------------------------------------------------------- GA4
// client_id ties the purchase to the visitor's GA session; it was read from the
// _ga cookie at checkout and kept with the order's utm data.
export async function sendGa4(measurementId, order) {
  const clientId = order.utm?._ga || `${Math.abs(parseInt(sha256(order.phone).slice(0, 8), 16))}.${Math.floor(new Date(order.created_at).getTime() / 1000)}`;
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET)}`;
  return post(url, {
    client_id: clientId,
    timestamp_micros: eventTime(order, 72) * 1000,
    events: [{
      name: 'purchase',
      params: {
        transaction_id: order.code, currency: 'BDT', value: order.total, shipping: order.delivery_fee,
        items: order.items.map((i) => clean({ item_id: i.product_id, item_name: i.title, item_variant: i.variant_name, price: i.unit_price, quantity: i.quantity })),
      },
    }],
  });
}
