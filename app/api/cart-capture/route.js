// Records the cart server-side once a valid phone is typed at checkout, so an
// operator can follow up if the order is never placed.
import { callRpc, cleanItems, clientIp, fail, json, readJson, sameOrigin } from '../../../lib/server/request.js';

export async function POST(request) {
  if (!sameOrigin(request)) return fail('server_error', 403);
  const body = await readJson(request);
  if (!body) return fail('invalid_items');
  const result = await callRpc('capture_abandoned_cart', {
    p_cart: {
      phone: String(body.phone ?? '').slice(0, 30),
      name: String(body.name ?? '').slice(0, 80),
      address: String(body.address ?? '').slice(0, 400),
      items: cleanItems(body.items),
    },
    p_client_key: clientIp(request),
  });
  return json({ ok: !!result.ok });
}
