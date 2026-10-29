// Minimal .xlsx reader: an .xlsx file is a zip of XML parts. Reads every sheet's
// cell values as text (shared strings, inline strings, numbers, booleans).
// Enough for the product upload template; no formulas, styles or dates needed.
import { unzipSync, strFromU8 } from 'fflate';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e] ?? m;
});
// Text of all <t> runs inside a fragment (handles rich text with several runs).
const textOf = (xml) => decode([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)[0];
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export function readXlsx(buffer) {
  const files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const read = (path) => (files[path] ? strFromU8(files[path]) : '');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = Object.fromEntries([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1], /Target="([^"]+)"/.exec(m[0])?.[1]]));

  const sheets = {};
  for (const m of read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])[1]);
    const target = rels[/r:id="([^"]+)"/.exec(m[0])[1]] ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const rows = [];
    for (const row of read(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const r = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
        const type = /t="(\w+)"/.exec(attrs)?.[1];
        const inner = c[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value = '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = textOf(inner);
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) value = decode(v);
        r[ref ? colIndex(ref) : r.length] = value.trim();
      }
      rows.push(Array.from(r, (x) => x ?? ''));
    }
    sheets[name] = rows;
  }
  return sheets;
}

// Turns a sheet into objects using its header row. `columns` maps our field
// names to a header prefix, so "Price (৳) *" matches "price".
export function sheetObjects(rows, columns) {
  if (!rows?.length) return [];
  const header = rows[0].map((h) => String(h).toLowerCase());
  const index = Object.fromEntries(Object.entries(columns).map(([key, prefix]) =>
    [key, header.findIndex((h) => h.startsWith(prefix.toLowerCase()))]));
  return rows.slice(1).map((row, i) => ({
    _row: i + 2,
    ...Object.fromEntries(Object.entries(index).map(([key, col]) => [key, col >= 0 ? (row[col] ?? '') : ''])),
  })).filter((o) => Object.entries(o).some(([k, v]) => k !== '_row' && v !== ''));
}
