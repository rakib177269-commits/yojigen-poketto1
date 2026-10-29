// Server copy of the browser's Meta Pixel events (same event_id, so Meta counts
// each once). Ad blockers stop the pixel but not this. Purchase is REFUSED here:
// purchases are reported only after an operator confirms the order.
import { clientIp, json, readJson, sameOrigin } from '../../../lib/server/request.js';
import { supabaseService } from '../../../lib/server/supabase.js';
import { getSettings } from '../../../lib/server/catalog.js';
import { sendMeta, serverVendors } from '../../../lib/server/marketing.js';

const ALLOWED = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Search', 'AddToWishlist']);
const str = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 10_000_000 ? Number(v) : undefined);

function customData(d) {
  if (!d || typeof d !== 'object') return undefined;
  const ids = Array.isArray(d.content_ids) ? d.content_ids.slice(0, 20).map((x) => String(x).slice(0, 64)) : undefined;
  const out = {
    currency: d.currency === 'BDT' ? 'BDT' : undefined,
    value: num(d.value),
    content_ids: ids,
    content_name: str(d.content_name, 150),
    content_type: d.content_type === 'product' ? 'product' : undefined,
    num_items: num(d.num_items),
    search_string: str(d.search_string, 100),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

function cookie(request, name) {
  return request.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ ok: false }, 403);
  const body = await readJson(request, 5_000);
  if (!body) return json({ ok: false, error: 'bad_request' }, 400);
  if (body.event_name === 'Purchase') return json({ ok: false, error: 'purchase_not_allowed' }, 400);
  if (!ALLOWED.has(body.event_name) || !/^[a-z]+-[0-9a-f-]{36}$/i.test(String(body.event_id ?? ''))) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const tracking = (await getSettings())?.integrations?.tracking ?? {};
  if (!serverVendors(tracking).meta) return new Response(null, { status: 204 });

  const ip = clientIp(request);
  const db = supabaseService();
  const { data: allowed } = await db.rpc('rate_limit_hit', { p_key: `capi:${ip}`, p_max: 120, p_seconds: 600 });
  if (allowed === false) return json({ ok: false, error: 'rate_limited' }, 429);

  // Only pages of this site may be reported as the event source.
  const host = request.headers.get('host');
  let url;
  try { url = new URL(String(body.url ?? '')); } catch { url = null; }
  const event = {
    event_name: body.event_name,
    event_id: body.event_id,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: url && url.host === host ? url.href.slice(0, 1000) : undefined,
    user_data: Object.fromEntries(Object.entries({
      client_ip_address: ip === 'unknown' ? undefined : ip,
      client_user_agent: str(request.headers.get('user-agent'), 400),
      fbp: cookie(request, '_fbp'),
      fbc: cookie(request, '_fbc'),
    }).filter(([, v]) => v)),
    custom_data: customData(body.custom_data),
  };
  const r = await sendMeta(tracking.meta_pixel_id, [event]);
  if (!r.ok) console.error('capi mirror failed:', r.error);
  return json({ ok: r.ok }, r.ok ? 200 : 502);
}
