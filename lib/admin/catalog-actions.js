'use server';
// Catalogue changes (admin + manager). Each calls a role-checked database
// function as the signed-in staff member, then refreshes the shop's cache.
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '../server/auth.js';
import { sanitizeHtml } from '../sanitize.js';
import { parseProductSheet } from '../import.js';

const ROLES = ['admin', 'manager'];
const MESSAGES = {
  not_allowed: 'Your role is not allowed to change the catalogue.',
  invalid_title: 'Title is required (up to 140 characters).',
  invalid_price: 'Price must be a whole number of taka.',
  invalid_status: 'Unknown status.',
  invalid_variant: 'Every colour needs a name.',
  invalid_colour: 'Colour codes look like #9CC3E6 (or leave empty).',
  invalid_image: 'One of the photos was not uploaded through the admin.',
  invalid_name: 'Name is required (up to 60 characters).',
  slug_taken: 'Another category already uses that web address.',
  banner_images_required: 'Upload both a desktop and a mobile image.',
  invalid_link: 'Link must start with / (a page on this site) or https://',
  invalid_code: 'Coupon code: 3–32 letters, numbers, - or _.',
  invalid_type: 'Choose a coupon type.',
  invalid_percent: 'Percent must be between 1 and 100.',
  invalid_value: 'Amount must be at least ৳1.',
  code_taken: 'That coupon code already exists.',
  coupon_used: 'This coupon has been used, so it can’t be deleted. Switch it off instead.',
  nothing_selected: 'Select at least one product.',
  not_found: 'Not found (it may have been deleted).',
};
const fail = (error) => {
  const m = /^import_(row|colour)_(\d+):(\w+)$/.exec(error?.message ?? '');
  if (m) return { error: `${m[1] === 'row' ? 'Product' : 'Colour'} #${m[2]}: ${m[3].replace(/_/g, ' ')}` };
  return { error: MESSAGES[error?.message] ?? error?.message ?? 'Something went wrong.' };
};

function catalogChanged(...paths) {
  revalidateTag('catalog', { expire: 0 });
  for (const p of paths) revalidatePath(p);
}

export async function saveProduct(_prev, formData) {
  const staff = await requireStaff(ROLES);
  let p;
  try { p = JSON.parse(String(formData.get('payload') ?? '')); } catch { return { error: 'Form data was invalid. Reload and try again.' }; }
  const removed = (p.removed_image_ids ?? []).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const payload = { ...p, description_html: sanitizeHtml(p.description_html ?? '') };
  delete payload.removed_image_ids;
  const { data, error } = await staff.supabase.rpc('admin_save_product', { p: payload });
  if (error) return fail(error);
  for (const id of removed) {
    const { error: e } = await staff.supabase.rpc('admin_remove_product_image', { p_image_id: id });
    if (e) return fail(e);
  }
  catalogChanged('/admin/products');
  if (!p.id) redirect(`/admin/products/${data.id}?saved=1`);
  revalidatePath(`/admin/products/${data.id}`);
  return { ok: 'Saved.', slug: data.slug };
}

export async function deleteProduct(id) {
  const staff = await requireStaff(ROLES);
  const { error } = await staff.supabase.rpc('admin_delete_product', { p_id: id });
  if (error) return fail(error);
  catalogChanged('/admin/products');
  redirect('/admin/products?deleted=1');
}

export async function bulkUpdate(_prev, formData) {
  const staff = await requireStaff(ROLES);
  const ids = formData.getAll('ids').filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const p = {
    status: String(formData.get('status') ?? ''),
    price: String(formData.get('price') ?? '').trim(),
    price_change_percent: String(formData.get('price_change_percent') ?? '').trim(),
    stock: String(formData.get('stock') ?? '').trim(),
  };
  if (!p.status && !p.price && !p.price_change_percent && !p.stock) return { error: 'Choose what to change.' };
  const { data, error } = await staff.supabase.rpc('admin_bulk_update_products', { p_ids: ids, p });
  if (error) return fail(error);
  catalogChanged('/admin/products');
  return { ok: `Updated ${data.updated} product(s).` };
}

export async function saveCategory(_prev, formData) {
  const staff = await requireStaff(ROLES);
  const p = Object.fromEntries(['id', 'name', 'slug', 'description', 'sort_order'].map((k) => [k, String(formData.get(k) ?? '')]));
  p.is_active = formData.get('is_active') === 'on';
  p.is_featured = formData.get('is_featured') === 'on';
  const { error } = await staff.supabase.rpc('admin_save_category', { p });
  if (error) return fail(error);
  catalogChanged('/admin/categories');
  return { ok: 'Saved.' };
}

export async function deleteCategory(id) {
  const staff = await requireStaff(ROLES);
  const { error } = await staff.supabase.rpc('admin_delete_category', { p_id: id });
  if (error) return fail(error);
  catalogChanged('/admin/categories');
  return { ok: true };
}

export async function saveBanner(_prev, formData) {
  const staff = await requireStaff(ROLES);
  let p;
  try { p = JSON.parse(String(formData.get('payload') ?? '')); } catch { return { error: 'Form data was invalid.' }; }
  const { error } = await staff.supabase.rpc('admin_save_banner', { p });
  if (error) return fail(error);
  catalogChanged('/admin/banners');
  return { ok: 'Saved.' };
}

export async function deleteBanner(id) {
  const staff = await requireStaff(ROLES);
  const { error } = await staff.supabase.rpc('admin_delete_banner', { p_id: id });
  if (error) return fail(error);
  catalogChanged('/admin/banners');
  return { ok: true };
}

const dhaka = (local) => (local ? `${local}:00+06:00` : '');

export async function saveCoupon(_prev, formData) {
  const staff = await requireStaff(ROLES);
  const p = Object.fromEntries(['id', 'code', 'type', 'value', 'max_discount', 'min_order', 'usage_limit']
    .map((k) => [k, String(formData.get(k) ?? '').trim()]));
  p.starts_at = dhaka(String(formData.get('starts_at') ?? ''));
  p.expires_at = dhaka(String(formData.get('expires_at') ?? ''));
  p.is_active = formData.get('is_active') === 'on';
  const { error } = await staff.supabase.rpc('admin_save_coupon', { p });
  if (error) return fail(error);
  revalidatePath('/admin/coupons');
  return { ok: 'Saved.' };
}

export async function deleteCoupon(id) {
  const staff = await requireStaff(ROLES);
  const { error } = await staff.supabase.rpc('admin_delete_coupon', { p_id: id });
  if (error) return fail(error);
  revalidatePath('/admin/coupons');
  return { ok: true };
}

export async function importProducts(_prev, formData) {
  const staff = await requireStaff(ROLES);
  const file = formData.get('file');
  if (!file || typeof file === 'string' || !file.size) return { errors: ['Choose the filled-in .xlsx file.'] };
  if (file.size > 5_000_000) return { errors: ['That file is too big (max 5 MB).'] };
  const { data: cats } = await staff.supabase.from('categories').select('name');
  let parsed;
  try {
    parsed = parseProductSheet(Buffer.from(await file.arrayBuffer()), (cats ?? []).map((c) => c.name));
  } catch {
    return { errors: ['Could not read that file. Save it as an Excel workbook (.xlsx) and try again.'] };
  }
  if (parsed.errors.length) return { errors: parsed.errors };
  if (formData.get('confirm') !== '1') {
    return { preview: parsed.rows.map((r) => ({ title: r.title, category: r.category, price: r.price, photos: r.photo_files.length })),
      colours: parsed.colours.length };
  }
  const { data, error } = await staff.supabase.rpc('admin_import_products', { p_rows: parsed.rows, p_colours: parsed.colours });
  if (error) return { errors: [fail(error).error] };
  catalogChanged('/admin/products', '/admin/import');
  return { imported: data.created };
}

export async function attachImportedPhotos(productId, images, matchedNames) {
  const staff = await requireStaff(ROLES);
  const { error } = await staff.supabase.rpc('admin_attach_product_images', {
    p_product_id: productId, p_images: images, p_matched_names: matchedNames,
  });
  if (error) return fail(error);
  catalogChanged('/admin/import');
  return { ok: true };
}
