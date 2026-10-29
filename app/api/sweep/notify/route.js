// Every 5 minutes (pg_cron): send queued customer/staff messages that weren't
// sent right away (or failed and are due a retry, up to 5 tries).
import { supabaseService } from '../../../../lib/server/supabase.js';
import { sweepAllowed } from '../../../../lib/server/sweep.js';
import { processOutbox } from '../../../../lib/server/notify.js';

export const maxDuration = 26;

export async function POST(request) {
  if (!(await sweepAllowed(request, supabaseService()))) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const r = await processOutbox({ limit: 40 });
    if (r.processed) console.log(`notify sweep: ${r.processed} message(s), ${r.sent} sent`);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
