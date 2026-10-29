// Pathao calls this whenever a parcel moves (picked up, in transit, delivered,
// returned...). Every call must carry the secret we chose in Pathao's webhook
// settings (header X-PATHAO-Signature). Each event is stored once, so a repeat
// delivery changes nothing.
import { timingSafeEqual } from 'node:crypto';
import { supabaseService } from '../../../../lib/server/supabase.js';

// Pathao's "verify webhook" check expects this header back with status 202.
// If their page shows a different value, set PATHAO_WEBHOOK_INTEGRATION_SECRET.
const INTEGRATION_HEADER = 'X-Pathao-Merchant-Webhook-Integration-Secret';
const DEFAULT_INTEGRATION_SECRET = 'f3992ecc-59da-4cbe-a049-a13da2018d51';

function accepted(request, body) {
  const secret = process.env.PATHAO_WEBHOOK_INTEGRATION_SECRET
    || request.headers.get(INTEGRATION_HEADER) || DEFAULT_INTEGRATION_SECRET;
  return Response.json(body, { status: 202, headers: { [INTEGRATION_HEADER]: secret } });
}

function signatureOk(request) {
  const expected = process.env.PATHAO_WEBHOOK_SECRET;
  if (!expected) return false;
  const a = Buffer.from(request.headers.get('x-pathao-signature') ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  if (payload.event === 'webhook_integration') return accepted(request, { ok: true });
  if (!signatureOk(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabaseService().rpc('courier_webhook', { p_provider: 'pathao', p_payload: payload });
  if (error) {
    console.error('pathao webhook failed:', error.message);
    return Response.json({ error: 'try again' }, { status: 500 }); // Pathao retries
  }
  return accepted(request, data);
}
