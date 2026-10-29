import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerKeys, metaPurchase, eventTime, sha256 } from '../lib/server/marketing.js';

const order = {
  code: 'YPABC1234', total: 960, delivery_fee: 70, name: 'Rahim  Uddin', phone: '8801712345678', email: 'Rahim@Example.com ',
  zone_code: 'dhaka_inside', fbp: 'fb.1.1.2', fbc: null, client_ip: '1.2.3.4', client_user_agent: 'UA',
  landing_url: 'https://yojigen-pokettobd.com/p/x', created_at: new Date(Date.now() - 3600_000).toISOString(),
  confirmed_at: new Date().toISOString(),
  items: [{ product_id: 'p1', title: 'Mug', quantity: 2, unit_price: 445 }],
};

test('customer details are hashed and normalised, never sent in plain text', () => {
  const k = customerKeys(order);
  assert.equal(k.ph, sha256('8801712345678'));
  assert.equal(k.em, sha256('rahim@example.com'));
  assert.equal(k.fn, sha256('rahim'));
  assert.equal(k.ln, sha256('uddin'));
  assert.equal(k.ct, sha256('dhaka'));
  assert.ok(!JSON.stringify(metaPurchase(order, 'https://x')).includes('8801712345678'));
});

test('Purchase uses the order code as event id (vendors drop repeats) and the order total', () => {
  const e = metaPurchase(order, 'https://x');
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.event_id, 'purchase-YPABC1234');
  assert.equal(e.custom_data.value, 960);
  assert.equal(e.custom_data.currency, 'BDT');
  assert.deepEqual(e.custom_data.content_ids, ['p1']);
  assert.equal(e.custom_data.num_items, 2);
  assert.equal(e.user_data.fbc, undefined);
});

test('event time is when the customer ordered, unless that is too old for the vendor', () => {
  assert.equal(eventTime(order, 72), new Date(order.created_at).getTime());
  const old = { ...order, created_at: new Date(Date.now() - 5 * 86400_000).toISOString() };
  assert.ok(Math.abs(eventTime(old, 72) - Date.now()) < 1000);
  assert.equal(eventTime(old, 7 * 24), new Date(old.created_at).getTime());
});
