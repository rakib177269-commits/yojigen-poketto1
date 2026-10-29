// Runs the database self-tests (migrations 0005/0006, 0011, 0014, 0017 and 0019) via
// the service role. Every check runs in a rolled-back transaction, so this is
// safe against production. Exits non-zero on any failure, which stops a deploy.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) {
  console.error('db self-test: NEXT_PUBLIC_SUPABASE_URL is not set.');
  process.exit(1);
}
if (!key) {
  // Without the service key the shop can show products but cannot take orders.
  // Don't block the very first deploys, but say so loudly.
  console.warn('\n*** db self-test SKIPPED: SUPABASE_SERVICE_ROLE_KEY is not set. Checkout will not work until it is. ***\n');
  process.exit(0);
}

const db = createClient(url, key, { auth: { persistSession: false } });
let failed = 0;
for (const suite of ['run_self_tests', 'run_admin_self_tests', 'run_catalog_self_tests', 'run_courier_self_tests', 'run_marketing_self_tests']) {
  const { data, error } = await db.rpc(suite);
  if (error) {
    console.error(`db self-test: could not run ${suite}:`, error.message);
    process.exit(1);
  }
  console.log(`\n${suite}`);
  for (const r of data.results) console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`);
  console.log(`${data.passed} passed, ${data.failed} failed`);
  failed += data.failed;
}
process.exit(failed === 0 ? 0 : 1);
