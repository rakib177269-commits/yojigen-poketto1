// Runs the database self-tests (supabase/migrations/0005_self_tests.sql) via
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

const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).rpc('run_self_tests');
if (error) {
  console.error('db self-test: could not run:', error.message);
  process.exit(1);
}
for (const r of data.results) console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`);
console.log(`\n${data.passed} passed, ${data.failed} failed`);
process.exit(data.failed === 0 ? 0 : 1);
