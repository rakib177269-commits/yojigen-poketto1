import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTaka, discountPercent } from '../lib/format.js';

test('taka formatting uses South Asian grouping', () => {
  assert.equal(formatTaka(1450), '৳1,450');
  assert.equal(formatTaka(125000), '৳1,25,000');
  assert.equal(formatTaka(0), '৳0');
});

test('discount percent', () => {
  assert.equal(discountPercent(690, 850), 19);
  assert.equal(discountPercent(500, null), 0);
  assert.equal(discountPercent(500, 400), 0);
});
