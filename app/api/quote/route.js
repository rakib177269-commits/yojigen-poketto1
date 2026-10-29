// Live checkout preview. Priced entirely by the database (quote_order).
import { callRpc, cleanItems, clientIp, fail, json, readJson, sameOrigin } from '../../../lib/server/request.js';

export async function POST(request) {
  if (!sameOrigin(request)) return fail('server_error', 403);
  const body = await readJson(request);
  if (!body) return fail('invalid_items');
  const result = await callRpc('quote_order', {
    p_items: cleanItems(body.items),
    p_address: String(body.address ?? '').slice(0, 400),
    p_coupon: String(body.coupon ?? '').slice(0, 32),
    p_client_key: clientIp(request),
  });
  return json(result, result.error === 'server_error' ? 500 : 200);
}
