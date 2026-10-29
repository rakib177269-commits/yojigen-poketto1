// Places a Cash on Delivery order. The browser sends WHAT it wants; the
// database decides every price, the delivery fee, the discount and the total.
import { callRpc, cleanItems, clientIp, fail, json, readJson, sameOrigin } from '../../../lib/server/request.js';
import { errorMessage } from '../../../lib/errors.js';
import { getSettings } from '../../../lib/server/catalog.js';

const str = (v, max) => (v == null ? null : String(v).slice(0, max));

export async function POST(request) {
  if (!sameOrigin(request)) return fail('server_error', 403);
  const body = await readJson(request);
  if (!body) return fail('invalid_items');
  if ((await getSettings())?.maintenance_mode) return fail('maintenance', 503);
  const ip = clientIp(request);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  // UTM tags plus the Google Analytics visitor id (_ga), used for the
  // server-side purchase report after confirmation.
  const tags = {
    ...Object.fromEntries(Object.entries(obj(body.utm)).slice(0, 5).map(([k, v]) => [str(k, 30), str(v, 100)])),
    ...Object.fromEntries(['_ga'].filter((k) => obj(body.ids)[k]).map((k) => [k, str(obj(body.ids)[k], 80)])),
  };
  const utm = Object.keys(tags).length ? tags : null;

  const result = await callRpc('place_order', {
    p_order: {
      name: str(body.name, 80),
      phone: str(body.phone, 30),
      address: str(body.address, 400),
      note: str(body.note, 500),
      email: str(body.email, 254),
      coupon: str(body.coupon, 32),
      items: cleanItems(body.items),
      fbp: str(body.fbp, 200),
      fbc: str(body.fbc, 300),
      landing_url: str(body.landing_url, 1000),
      utm,
      client_ip: ip === 'unknown' ? null : ip,
      user_agent: str(request.headers.get('user-agent'), 400),
    },
    p_client_key: ip,
  });

  if (result.ok) return json({ ok: true, code: result.code, total: result.total });
  const status = result.error === 'rate_limited' ? 429 : result.error === 'server_error' ? 500 : 400;
  return json({ ok: false, error: result.error, message: errorMessage(result.error), quote: result.quote }, status);
}
