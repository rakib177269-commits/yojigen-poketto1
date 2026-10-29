import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, stripHtml } from '../lib/sanitize.js';

test('keeps simple formatting', () => {
  assert.equal(sanitizeHtml('<p>Hi <strong>there</strong></p><ul><li>a</li></ul>'),
    '<p>Hi <strong>there</strong></p><ul><li>a</li></ul>');
});

test('removes scripts, handlers and unknown tags', () => {
  assert.equal(sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script>'), '<p>a</p>');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>b'), 'b');
  assert.equal(sanitizeHtml('<div style="x"><span>c</span></div>'), 'c');
  assert.equal(sanitizeHtml('<svg><script>alert(1)</script></svg>ok'), 'ok');
});

test('links: only safe schemes, forced rel', () => {
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(sanitizeHtml('<a href="https://ex.com" onclick="y">x</a>'),
    '<a href="https://ex.com" rel="nofollow noopener noreferrer" target="_blank">x</a>');
});

test('stray angle brackets are escaped', () => {
  assert.equal(sanitizeHtml('a < b > c'), 'a &lt; b &gt; c');
});

test('stripHtml for meta descriptions', () => {
  assert.equal(stripHtml('<p>Hello&nbsp;<b>world</b></p>'), 'Hello world');
});
