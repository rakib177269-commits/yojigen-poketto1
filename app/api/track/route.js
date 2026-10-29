// Order tracking: order code + the phone number used to order.
import { callRpc, clientIp, fail, json, readJson } from '../../../lib/server/request.js';
import { errorMessage } from '../../../lib/errors.js';

export async function POST(request) {
  const body = await readJson(request, 2000);
  if (!body) return fail('not_found');
  const result = await callRpc('track_order', {
    p_code: String(body.code ?? '').slice(0, 20),
    p_phone: String(body.phone ?? '').slice(0, 30),
    p_client_key: clientIp(request),
  });
  if (result.ok) return json(result);
  const status = result.error === 'rate_limited' ? 429 : result.error === 'server_error' ? 500 : 404;
  return json({ ok: false, error: result.error, message: errorMessage(result.error) }, status);
}
