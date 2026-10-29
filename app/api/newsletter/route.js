import { callRpc, clientIp, fail, json, readJson, sameOrigin } from '../../../lib/server/request.js';
import { errorMessage } from '../../../lib/errors.js';

export async function POST(request) {
  if (!sameOrigin(request)) return fail('server_error', 403);
  const body = await readJson(request, 2000);
  const result = await callRpc('newsletter_subscribe', {
    p_email: String(body?.email ?? '').slice(0, 254),
    p_client_key: clientIp(request),
  });
  if (result.ok) return json({ ok: true });
  return json({ ok: false, error: result.error, message: errorMessage(result.error) }, result.error === 'rate_limited' ? 429 : 400);
}
