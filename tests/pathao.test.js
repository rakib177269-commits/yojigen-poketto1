import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistory } from '../lib/server/pathao.js';

test('Pathao history: usual answer', () => {
  assert.deepEqual(summarizeHistory({ customer: { total_delivery: 10, successful_delivery: 9 }, customer_rating: 'excellent_customer' }),
    { total: 10, successful: 9, rate: 90, rating: 'excellent customer' });
});

test('Pathao history: new customer has no rate', () => {
  assert.deepEqual(summarizeHistory({ customer: { total_delivery: 0, successful_delivery: 0 } }),
    { total: 0, successful: 0, rate: null, rating: null });
});

test('Pathao history: unknown shape is ignored, not guessed', () => {
  assert.equal(summarizeHistory({ something: 'else' }), null);
  assert.equal(summarizeHistory(null), null);
});
