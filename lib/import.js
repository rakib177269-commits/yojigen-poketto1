// Product spreadsheet (docs/product-upload-template.xlsx) -> rows for the
// admin_import_products database function. Validation here gives friendly,
// row-numbered messages; the database validates again.
import { readXlsx, sheetObjects } from './xlsx.js';

const PRODUCT_COLUMNS = {
  title: 'title', category: 'category', price: 'price', compare_at_price: 'compare-at', stock: 'stock',
  status: 'status', tags: 'tags', description: 'description', photo_files: 'photo files',
  seo_title: 'seo title', seo_description: 'seo description',
};
const COLOUR_COLUMNS = { product_title: 'product title', name: 'colour name', color_hex: 'colour code', stock: 'stock' };

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function textToHtml(text) {
  return String(text ?? '').trim().split(/\n\s*\n/).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}
const wholeTaka = (v) => String(v ?? '').replace(/[৳,\s]/g, '').replace(/\.0+$/, '');
const isExample = (v) => /^example\b/i.test(String(v ?? '').trim());

export function parseProductSheet(buffer, categoryNames) {
  const sheets = readXlsx(buffer);
  const productsSheet = sheets.Products ?? Object.values(sheets).find((rows) => /title/i.test(rows?.[0]?.[0] ?? ''));
  if (!productsSheet) return { errors: ['No "Products" sheet found. Please use the template.'] };
  const known = new Map(categoryNames.map((n) => [n.toLowerCase(), n]));
  const errors = [];

  const rows = sheetObjects(productsSheet, PRODUCT_COLUMNS).filter((r) => !isExample(r.title)).map((r) => {
    const price = wholeTaka(r.price);
    const compare = wholeTaka(r.compare_at_price);
    if (!r.title) errors.push(`Products row ${r._row}: title is missing.`);
    if (!known.has(r.category.toLowerCase())) errors.push(`Products row ${r._row}: category "${r.category}" doesn't exist. Use one of: ${categoryNames.join(', ')}.`);
    if (!/^\d+$/.test(price)) errors.push(`Products row ${r._row}: price "${r.price}" must be a whole number of taka.`);
    if (compare && !/^\d+$/.test(compare)) errors.push(`Products row ${r._row}: compare-at price "${r.compare_at_price}" must be a whole number.`);
    if (r.stock && !/^\d+$/.test(wholeTaka(r.stock))) errors.push(`Products row ${r._row}: stock "${r.stock}" must be a whole number.`);
    return {
      row: r._row, title: r.title, category: known.get(r.category.toLowerCase()) ?? r.category,
      price, compare_at_price: compare, stock: wholeTaka(r.stock),
      status: /^draft$/i.test(r.status) ? 'draft' : 'active', tags: r.tags,
      description_html: textToHtml(r.description),
      photo_files: r.photo_files.split(/[,;\n]/).map((f) => f.trim()).filter(Boolean),
      seo_title: r.seo_title, seo_description: r.seo_description,
    };
  });
  const titles = new Map();
  for (const r of rows) {
    const k = r.title.toLowerCase();
    if (titles.has(k)) errors.push(`Products row ${r.row}: same title as row ${titles.get(k)}. Titles must be unique.`);
    titles.set(k, r.row);
  }

  const colours = sheetObjects(sheets.Colours ?? [], COLOUR_COLUMNS).filter((c) => !isExample(c.product_title)).map((c) => {
    if (!titles.has(c.product_title.toLowerCase())) errors.push(`Colours row ${c._row}: no product titled "${c.product_title}" in the Products sheet.`);
    if (!c.name) errors.push(`Colours row ${c._row}: colour name is missing.`);
    if (c.color_hex && !/^#[0-9a-f]{6}$/i.test(c.color_hex)) errors.push(`Colours row ${c._row}: colour code "${c.color_hex}" should look like #9CC3E6 (or leave it empty).`);
    return { row: c._row, product_title: c.product_title, name: c.name, color_hex: c.color_hex, stock: wholeTaka(c.stock) };
  });

  if (!rows.length) errors.push('No products found. Fill the "Products" sheet (and delete the grey EXAMPLE rows).');
  return { rows, colours, errors };
}
