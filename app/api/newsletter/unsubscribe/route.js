// Unsubscribe. Accepts the form POST from /unsubscribe and RFC 8058 one-click
// POSTs from mail apps (List-Unsubscribe-Post: List-Unsubscribe=One-Click).
import { callRpc } from '../../../../lib/server/request.js';

export async function POST(request) {
  const url = new URL(request.url);
  let token = url.searchParams.get('token');
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = form?.get('token');
  }
  const result = await callRpc('newsletter_unsubscribe', { p_token: String(token ?? '').slice(0, 64) });
  if (url.searchParams.get('token')) {
    return new Response(result.ok ? 'Unsubscribed' : 'Invalid token', { status: result.ok ? 200 : 400 });
  }
  return Response.redirect(new URL(`/unsubscribe?done=${result.ok ? 1 : 0}`, url), 303);
}
