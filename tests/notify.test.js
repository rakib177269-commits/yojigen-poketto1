import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smsText, otpText, emailFor } from '../lib/server/notify.js';
import { signSession, verifySession } from '../lib/server/session-token.js';

const order = {
  code: 'YPABCDEFG', total: 123456, subtotal: 123386, discount: 0, delivery_fee: 70, consignment_id: 'DT2910251234ABCD',
  name: 'Rahim <script>alert(1)</script>', phone: '8801712345678', address: 'House 1 & 2, Dhaka', note: null,
  zone: { name: 'Inside Dhaka', eta: 'Within 2 days' },
  items: [{ title: 'Mug <b>', variant_name: 'Blue', quantity: 2, line_total: 123386 }],
};

test('every SMS fits one 160-character message and uses plain characters (no Bangla/৳ surcharge)', () => {
  for (const kind of ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled']) {
    const t = smsText(kind, order);
    assert.ok(t.length <= 160, `${kind} is ${t.length} chars`);
    assert.match(t, /^[\x20-\x7E]+$/, `${kind} has non-GSM characters`);
  }
  assert.ok(otpText('123456').length <= 160);
  assert.equal(smsText('staff_new_order', order), null);
});

test('emails escape customer-typed text', () => {
  const m = emailFor('staff_new_order', order);
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(m.html.includes('House 1 &amp; 2'));
  assert.ok(!emailFor('placed', order).html.includes('<b>'));
  assert.equal(emailFor('nonsense', order), null);
});

test('session cookie: valid, tampered, wrong key, expired', () => {
  const key = 'k'.repeat(64);
  const exp = Math.floor(Date.now() / 1000) + 60;
  const token = signSession({ c: 'cust-1', p: '8801712345678', exp }, key);
  assert.equal(verifySession(token, key).c, 'cust-1');
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ c: 'someone-else', p: 'x', exp })).toString('base64url');
  assert.equal(verifySession(`${forged}.${sig}`, key), null);
  assert.equal(verifySession(token, 'other-key'), null);
  assert.equal(verifySession(token, key, (exp + 1) * 1000), null);
  assert.equal(verifySession(`${body}`, key), null);
  assert.equal(verifySession(undefined, key), null);
});
