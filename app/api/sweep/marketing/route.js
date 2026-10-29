// Every 10 minutes (pg_cron): report confirmed orders as Purchase to Meta and
// Google. This is the ONLY place a Purchase is ever sent. Orders are
// claimed first, so overlapping runs can't double-send, and every vendor gets
// the order code as event id, so a repeat would be dropped as a duplicate.
import { supabaseService } from '../../../../lib/server/supabase.js';
import { sweepAllowed } from '../../../../lib/server/sweep.js';
import { getSettings } from '../../../../lib/server/catalog.js';
import { SITE } from '../../../../lib/site.js';
import { metaPurchase, sendGa4, sendMeta, serverVendors } from '../../../../lib/server/marketing.js';

export const maxDuration = 26;

export async function POST(request) {
  const db = supabaseService();
  if (!(await sweepAllowed(request, db))) return Response.json({ error: 'forbidden' }, { status: 403 });

  const tracking = (await getSettings())?.integrations?.tracking ?? {};
  const enabled = Object.entries(serverVendors(tracking)).filter(([, on]) => on).map(([v]) => v);
  if (!enabled.length) return Response.json({ ok: true, skipped: 'no vendor configured' });

  const { data: orders, error } = await db.rpc('marketing_claim_orders', { p_vendors: enabled, p_limit: 25 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const order of orders) {
    const results = {};
    const todo = enabled.filter((v) => !order.sent?.[v]);
    await Promise.all(todo.map(async (v) => {
      if (v === 'meta') results.meta = await sendMeta(tracking.meta_pixel_id, [metaPurchase(order, SITE.url)]);
      if (v === 'ga4') results.ga4 = await sendGa4(tracking.ga4_id, order);
    }));
    for (const r of Object.values(results)) if (r.ok) sent += 1;
    const { error: finishError } = await db.rpc('marketing_finish_order', {
      p_order_id: order.id,
      p_results: Object.fromEntries(Object.entries(results).map(([v, r]) => [v, { ok: r.ok, error: r.error ?? null }])),
    });
    if (finishError) console.error('marketing sweep: could not record result for', order.code, finishError.message);
  }
  if (orders.length) console.log(`marketing sweep: ${orders.length} order(s), ${sent} vendor send(s) ok`);
  return Response.json({ ok: true, orders: orders.length, sent });
}
