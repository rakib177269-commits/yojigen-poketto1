'use server';
// Operator actions. Each one calls a database function AS the signed-in staff
// member; the database checks the role and writes the audit log.
import { revalidatePath, revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { kickOutbox } from '../server/notify.js';
import { redirect } from 'next/navigation';
import { requireStaff } from '../server/auth.js';
import { normalizeBdPhone } from '../phone.js';

const MESSAGES = {
  not_allowed: 'Your role is not allowed to do that.',
  not_pending: 'This order is no longer pending.',
  cannot_reject: 'Only pending or confirmed orders can be rejected.',
  invalid_transition: 'That status change is not allowed from the current status.',
  not_editable: 'Only pending or confirmed orders can be edited.',
  cart_changed: 'Some items are unavailable or out of stock.',
  out_of_stock: 'Not enough stock for that change.',
  invalid_phone: 'That phone number is not valid.',
  invalid_name: 'Name must be 2–80 characters.',
  invalid_address: 'Address must be 8–400 characters.',
  invalid_fee: 'Delivery fee must be a whole number of taka.',
  invalid_discount: 'Discount must be a whole number of taka.',
  invalid_email: 'That email address is not valid.',
  already_staff: 'That person is already on the team.',
  cannot_demote_self: 'You cannot remove your own admin access.',
  invalid_threshold: 'Free delivery threshold must be a whole number.',
  invalid_items: 'Add at least one item.',
};

const fail = (error) => ({ error: MESSAGES[error?.message] || error?.message || 'Something went wrong.' });

async function rpc(fn, args, roles) {
  const staff = await requireStaff(roles);
  const { data, error } = await staff.supabase.rpc(fn, args);
  return { data, error };
}

function orderChanged(id) {
  if (id) after(() => kickOutbox(id)); // the customer's SMS/email for this change
  revalidatePath('/admin', 'layout');
  if (id) revalidatePath(`/admin/orders/${id}`);
  revalidateTag('catalog', { expire: 0 }); // stock and best-sellers changed
}

export async function confirmOrder(id) {
  const { error } = await rpc('admin_confirm_order', { p_order_id: id });
  if (error) return fail(error);
  orderChanged(id);
  return { ok: 'Order confirmed.' };
}

export async function rejectOrder(id, _prev, formData) {
  const { error } = await rpc('admin_reject_order', { p_order_id: id, p_reason: String(formData.get('reason') ?? '').slice(0, 300) });
  if (error) return fail(error);
  orderChanged(id);
  return { ok: 'Order rejected and stock returned.' };
}

export async function setStatus(id, status, _prev, formData) {
  const restock = formData ? formData.get('restock') !== 'no' : true;
  const note = formData ? String(formData.get('note') ?? '').slice(0, 500) : null;
  const { error } = await rpc('admin_set_status', { p_order_id: id, p_status: status, p_note: note, p_restock: restock });
  if (error) return fail(error);
  orderChanged(id);
  return { ok: 'Status updated.' };
}

function parseItems(formData) {
  const items = [];
  for (const [key, value] of formData.entries()) {
    const m = /^qty:([0-9a-f-]{36}):([0-9a-f-]{36}|)$/.exec(key);
    const qty = Number.parseInt(value, 10);
    if (m && qty > 0) items.push({ product_id: m[1], variant_id: m[2] || null, quantity: Math.min(qty, 99) });
  }
  return items;
}

export async function updateOrder(id, _prev, formData) {
  const patch = {};
  for (const k of ['name', 'phone', 'address', 'note', 'delivery_fee', 'discount']) {
    const v = formData.get(k);
    if (v !== null) patch[k] = String(v).trim();
  }
  if (formData.get('edit_items') === '1') {
    patch.items = parseItems(formData);
    if (!patch.items.length) return fail({ message: 'invalid_items' });
  }
  const { error } = await rpc('admin_update_order', { p_order_id: id, p: patch });
  if (error) return fail(error);
  orderChanged(id);
  return { ok: 'Order saved.' };
}

export async function createManualOrder(_prev, formData) {
  const items = parseItems(formData);
  if (!items.length) return fail({ message: 'invalid_items' });
  const order = {
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    address: String(formData.get('address') ?? ''),
    note: String(formData.get('note') ?? ''),
    items,
  };
  const fee = String(formData.get('delivery_fee') ?? '').trim();
  if (fee !== '') order.delivery_fee = fee;
  const { data, error } = await rpc('admin_create_order', { p_order: order });
  if (error) return fail(error);
  orderChanged(null);
  redirect(`/admin/orders/${data.id}?created=1`);
}

export async function customerCheck(phone) {
  if (!normalizeBdPhone(phone)) return fail({ message: 'invalid_phone' });
  const { data, error } = await rpc('admin_customer_check', { p_phone: phone });
  return error ? fail(error) : { data };
}

export async function updateAbandoned(id, status) {
  const { error } = await rpc('admin_update_abandoned_cart', { p_id: id, p_status: status });
  if (error) return fail(error);
  revalidatePath('/admin/abandoned');
  return { ok: true };
}

export async function updateSettings(_prev, formData) {
  const threshold = String(formData.get('free_shipping_threshold') ?? '').trim();
  const { error } = await rpc('admin_update_settings', { p: {
    maintenance_mode: formData.get('maintenance_mode') === 'on',
    free_shipping_threshold: threshold === '' ? null : threshold,
  } }, ['admin']);
  if (error) return fail(error);
  revalidateTag('settings', { expire: 0 });
  revalidatePath('/admin/settings');
  return { ok: 'Settings saved.' };
}

export async function updateZone(code, _prev, formData) {
  const { error } = await rpc('admin_update_zone', {
    p_code: code,
    p_fee: Number.parseInt(formData.get('fee'), 10),
    p_eta: String(formData.get('eta') ?? ''),
    p_keywords: String(formData.get('keywords') ?? '').split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
  }, ['admin']);
  if (error) return fail(error);
  revalidateTag('settings', { expire: 0 });
  revalidatePath('/admin/settings');
  return { ok: 'Zone saved.' };
}

export async function inviteStaff(_prev, formData) {
  const { error } = await rpc('admin_invite_staff', {
    p_email: String(formData.get('email') ?? ''), p_role: String(formData.get('role') ?? ''),
  }, ['admin']);
  if (error) return fail(error);
  revalidatePath('/admin/team');
  return { ok: 'Invited. Ask them to open /admin/login and request a sign-in link with this email.' };
}

export async function cancelInvite(email) {
  const { error } = await rpc('admin_cancel_invite', { p_email: email }, ['admin']);
  if (error) return fail(error);
  revalidatePath('/admin/team');
  return { ok: true };
}

export async function updateStaff(userId, _prev, formData) {
  const { error } = await rpc('admin_update_staff', {
    p_user_id: userId, p_role: String(formData.get('role')), p_active: formData.get('active') === 'on',
  }, ['admin']);
  if (error) return fail(error);
  revalidatePath('/admin/team');
  return { ok: 'Saved.' };
}
