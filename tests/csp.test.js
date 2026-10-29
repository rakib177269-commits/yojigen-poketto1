import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, VENDORS } from '../lib/csp.js';

const parse = (csp) => Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('every vendor host is allowed in script-src, connect-src AND img-src', () => {
  const csp = parse(buildCsp({ nonce: 'abc', supabaseUrl: 'https://x.supabase.co' }));
  for (const [name, v] of Object.entries(VENDORS)) {
    assert.ok(v.script.length && v.connect.length && v.img.length, `${name} must list hosts for all three directives`);
    for (const h of v.script) assert.ok(csp['script-src'].includes(h), `${name} ${h} in script-src`);
    for (const h of v.connect) assert.ok(csp['connect-src'].includes(h), `${name} ${h} in connect-src`);
    for (const h of v.img) assert.ok(csp['img-src'].includes(h), `${name} ${h} in img-src`);
  }
});

test('GA4 and Meta image-beacon hosts are in img-src', () => {
  const csp = parse(buildCsp({ nonce: 'abc' }));
  assert.ok(csp['img-src'].includes('https://www.facebook.com'));
  assert.ok(csp['img-src'].includes('https://www.google-analytics.com'));
  assert.ok(csp['img-src'].includes('https://*.google-analytics.com'));
});

test('scripts need the nonce; no unsafe-inline or unsafe-eval in production', () => {
  const csp = parse(buildCsp({ nonce: 'n0nce', supabaseUrl: 'https://x.supabase.co' }));
  assert.ok(csp['script-src'].includes("'nonce-n0nce'"));
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
  assert.ok(!csp['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.ok(csp['img-src'].includes('https://x.supabase.co'), 'product images from Supabase Storage');
});
