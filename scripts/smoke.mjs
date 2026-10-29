// Smoke test: starts the production build and checks every page renders.
// Runs after `next build` (locally and in the Netlify build), so a page that
// crashes stops the deploy.
import { spawn } from 'node:child_process';

const PORT = 4010;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = {
  '/': 200, '/shop': 200, '/shop?q=a&sort=price-asc': 200, '/checkout': 200, '/track': 200,
  '/wishlist': 200, '/about': 200, '/shipping': 200, '/returns': 200, '/privacy': 200, '/terms': 200,
  '/unsubscribe': 200, '/robots.txt': 200, '/sitemap.xml': 200, '/manifest.webmanifest': 200,
  '/this-page-does-not-exist': 404, '/p/this-product-does-not-exist': 404,
};

// Own process group, so stopping it also stops the Next.js server process.
const server = spawn('node_modules/.bin/next', ['start', '-p', String(PORT)], { stdio: 'ignore', detached: true });
const stop = (code) => {
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
  process.exit(code);
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/robots.txt'); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error('server did not start');
}

try {
  await waitForServer();
  let failed = 0;
  // A product and a category page from the live sitemap, if there are any.
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
  for (const prefix of ['/p/', '/shop/']) {
    const m = sitemap.match(new RegExp(`<loc>[^<]*?(${prefix}[^<]+)</loc>`));
    if (m) PAGES[m[1]] = 200;
  }
  for (const [path, expected] of Object.entries(PAGES)) {
    const res = await fetch(BASE + path, { headers: { 'x-forwarded-proto': 'https' } });
    const csp = res.headers.get('content-security-policy') || '';
    const okCsp = path.match(/\.(txt|xml|webmanifest)$/) || csp.includes("'nonce-");
    const ok = res.status === expected && okCsp;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.status} ${path}${okCsp ? '' : ' (missing CSP nonce)'}`);
  }
  console.log(failed ? `\n${failed} smoke check(s) failed` : '\nAll pages render.');
  stop(failed ? 1 : 0);
} catch (err) {
  console.error('smoke test error:', err.message);
  stop(1);
}
