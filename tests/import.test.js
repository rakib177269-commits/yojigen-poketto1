import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { readXlsx } from '../lib/xlsx.js';
import { parseProductSheet, textToHtml } from '../lib/import.js';

const template = readFileSync(new URL('../docs/product-upload-template.xlsx', import.meta.url));
const CATS = ['Gadgets', 'Gifts', 'Cute Items', 'Accessories'];

test('reads the real template: three sheets, headers intact', () => {
  const sheets = readXlsx(template);
  assert.deepEqual(Object.keys(sheets), ['How to fill', 'Products', 'Colours']);
  assert.equal(sheets.Products[0][0], 'Title *');
  assert.match(sheets.Products[1][0], /^EXAMPLE/);
});

test('the untouched template has only EXAMPLE rows, so nothing is imported', () => {
  const r = parseProductSheet(template, CATS);
  assert.equal(r.rows.length, 0);
  assert.match(r.errors.join(' '), /No products found/);
});

// Builds a tiny .xlsx in memory with inline strings (as some apps save them).
function makeXlsx(products, colours = [['Product title *', 'Colour name *', 'Colour code', 'Stock *']]) {
  const sheet = (rows) => `<worksheet><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((v, j) =>
    `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Products" sheetId="1" r:id="rId1"/><sheet name="Colours" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet(products)),
    'xl/worksheets/sheet2.xml': strToU8(sheet(colours)),
  });
}
const HEAD = ['Title *', 'Category *', 'Price (৳) *', 'Compare-at price (৳)', 'Stock', 'Status', 'Tags', 'Description', 'Photo files'];

test('parses products, colours, Bangla text, ৳ signs and photo lists', () => {
  const file = makeXlsx(
    [HEAD, ['মিনি ফ্যান', 'gadgets', '৳1,250', '1500', '7', '', 'fan, usb', 'Line one\nline two\n\nPara <2>', 'fan-1.jpg, fan-2.jpg']],
    [['Product title *', 'Colour name *', 'Colour code', 'Stock *'], ['মিনি ফ্যান', 'Pink', '#F2B8C6', '3']],
  );
  const r = parseProductSheet(file, CATS);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows[0].title, 'মিনি ফ্যান');
  assert.equal(r.rows[0].category, 'Gadgets');
  assert.equal(r.rows[0].price, '1250');
  assert.deepEqual(r.rows[0].photo_files, ['fan-1.jpg', 'fan-2.jpg']);
  assert.equal(r.rows[0].description_html, '<p>Line one<br>line two</p><p>Para &lt;2&gt;</p>');
  assert.equal(r.colours[0].name, 'Pink');
});

test('reports friendly, row-numbered errors', () => {
  const file = makeXlsx([HEAD, ['A', 'Toys', 'abc'], ['A', 'Gifts', '100']],
    [['Product title *', 'Colour name *', 'Colour code', 'Stock *'], ['Nope', 'Red', 'red', '1']]);
  const { errors } = parseProductSheet(file, CATS);
  assert.ok(errors.some((e) => /row 2: category "Toys"/.test(e)));
  assert.ok(errors.some((e) => /row 2: price "abc"/.test(e)));
  assert.ok(errors.some((e) => /row 3: same title as row 2/.test(e)));
  assert.ok(errors.some((e) => /Colours row 2: no product titled "Nope"/.test(e)));
  assert.ok(errors.some((e) => /colour code "red"/.test(e)));
});

test('textToHtml escapes HTML', () => {
  assert.equal(textToHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
});
