import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bnToAsciiDigits, normalizeBdPhone, formatBdPhone } from '../lib/phone.js';

test('Bangla digits are converted, not deleted', () => {
  assert.equal(bnToAsciiDigits('০১৭১২৩৪৫৬৭৮'), '01712345678');
  // The bug this guards against: stripping non-digits first deletes Bangla digits.
  assert.equal('০১৭১২৩৪৫৬৭৮'.replace(/\D/g, ''), '');
});

test('normalises every common way of writing a BD mobile number', () => {
  const cases = {
    '01712345678': '8801712345678',
    '০১৭১২৩৪৫৬৭৮': '8801712345678',
    '০১7১২ ৩৪৫ ৬৭৮': '8801712345678',
    '+880 1712-345678': '8801712345678',
    '8801712345678': '8801712345678',
    '008801512345678': '8801512345678',
    '1912345678': '8801912345678',
    '(017) 1234 5678': '8801712345678',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeBdPhone(input), expected, input);
  }
});

test('rejects invalid numbers', () => {
  for (const input of ['', 'abc', '01212345678', '0171234567', '017123456789', '+1 415 555 0100', null, undefined]) {
    assert.equal(normalizeBdPhone(input), null, String(input));
  }
});

test('formats for display', () => {
  assert.equal(formatBdPhone('8801712345678'), '01712-345678');
});
