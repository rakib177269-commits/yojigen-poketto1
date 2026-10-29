// Operations self-check, callable only with the sweep secret (from the database:
// select private.call_sweep('/api/sweep/health')). Reports which integrations are
// configured — never any key — and tests the Pathao connection by listing stores.
import { supabaseService } from '../../../../lib/server/supabase.js';
import { sweepAllowed } from '../../../../lib/server/sweep.js';
import { getSettings } from '../../../../lib/server/catalog.js';
import { pathao, pathaoEnvStatus, PathaoError } from '../../../../lib/server/pathao.js';
import { notifyStatus } from '../../../../lib/server/notify.js';
import { serverVendors, tokenStatus } from '../../../../lib/server/marketing.js';
import { SITE } from '../../../../lib/site.js';

export const maxDuration = 26;

export async function POST(request) {
  if (!(await sweepAllowed(request, supabaseService()))) return Response.json({ error: 'forbidden' }, { status: 403 });
  const integrations = (await getSettings())?.integrations ?? {};
  const report = {
    site_url: SITE.url,
    pathao: { env: pathaoEnvStatus(), store_id: integrations.pathao?.store_id ?? null },
    messages: notifyStatus(),
    marketing: { ids: { meta: Boolean(integrations.tracking?.meta_pixel_id), ga4: Boolean(integrations.tracking?.ga4_id) },
      tokens: tokenStatus(), server_sending: serverVendors(integrations.tracking) },
  };
  if (report.pathao.env.client) {
    try {
      const stores = await pathao.stores();
      report.pathao.connection = 'ok';
      report.pathao.stores = stores.map((s) => ({ id: s.store_id, name: s.store_name, active: s.is_active }));
    } catch (err) {
      report.pathao.connection = err instanceof PathaoError ? `failed: ${err.message} (HTTP ${err.status})` : `failed: ${err.message}`;
    }
  }
  return Response.json(report);
}
