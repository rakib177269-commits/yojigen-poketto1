// Helpers for our JSON API routes.
import { errorMessage } from '../errors.js';

// Netlify puts the real client IP in x-nf-client-connection-ip.
export function clientIp(request) {
  const h = request.headers;
  return (
    h.get('x-nf-client-connection-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

export async function readJson(request, maxBytes = 20_000) {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(code, status = 400, extra = {}) {
  return json({ ok: false, error: code, message: errorMessage(code), ...extra }, status);
}

// Same-origin check for state-changing POSTs (defence in depth against CSRF).
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser clients; the RPCs validate everything anyway
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

// Only the fields place_order/quote_order read from each line.
export function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 30).map((i) => ({
    product_id: String(i?.product_id ?? ''),
    variant_id: i?.variant_id ? String(i.variant_id) : null,
    quantity: Number.parseInt(i?.quantity, 10) || 0,
  }));
}

export async function callRpc(fn, args) {
  const { supabaseService } = await import('./supabase.js');
  let client;
  try {
    client = supabaseService();
  } catch (err) {
    console.error(err.message);
    return { ok: false, error: 'server_error' };
  }
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.error(`rpc ${fn} failed:`, error.message);
    return { ok: false, error: 'server_error' };
  }
  return data;
}
