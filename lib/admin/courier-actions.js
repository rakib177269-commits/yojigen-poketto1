'use server';
// Pathao actions for staff. The database decides who may book and locks the
// order while Pathao is called, so a double click can never book a parcel twice.
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { kickOutbox } from '../server/notify.js';
import { requireStaff, can } from '../server/auth.js';
import { supabaseService } from '../server/supabase.js';
import { pathao, PathaoError, NORMAL_DELIVERY, PARCEL, summarizeHistory } from '../server/pathao.js';
import { normalizeBdPhone } from '../phone.js';

const MESSAGES = {
  not_allowed: 'Your role is not allowed to do that.',
  not_confirmed: 'Only confirmed orders can be sent to Pathao.',
  already_booked: 'This order is already booked with Pathao.',
  booking_in_progress: 'This order is being sent right now. Wait a minute and refresh.',
  courier_not_configured: 'Set your Pathao store in Settings first.',
  invalid_store_id: 'Store ID must be a number (see “Test connection”).',
  invalid_weight: 'Weight must be between 0.1 and 10 kg.',
};
const fail = (error) => ({ error: MESSAGES[error?.message] || error?.message || 'Something went wrong.' });

const DISPATCH = ['admin', 'manager', 'support', 'packer'];

function weight(value, fallback) {
  const w = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(w) && w >= 0.1 && w <= 10 ? Math.round(w * 10) / 10 : fallback;
}
const optionalId = (v) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : undefined);

async function book(staff, orderId, opts = {}) {
  const { data: o, error } = await staff.supabase.rpc('admin_courier_claim', { p_order_id: orderId });
  if (error) return fail(error);
  const instruction = [opts.instruction, o.instruction, o.note && `Customer note: ${o.note}`]
    .filter(Boolean).join(' · ').slice(0, 250);
  const order = {
    store_id: o.store_id,
    merchant_order_id: o.code,
    recipient_name: o.name.slice(0, 100),
    recipient_phone: o.phone,
    recipient_address: o.address.replace(/\s+/g, ' ').slice(0, 220),
    recipient_city: optionalId(opts.city),
    recipient_zone: optionalId(opts.zone),
    recipient_area: optionalId(opts.area),
    delivery_type: NORMAL_DELIVERY,
    item_type: PARCEL,
    special_instruction: instruction || undefined,
    item_quantity: Math.max(1, Number(o.quantity) || 1),
    item_weight: weight(opts.weight, Number(o.default_weight) || 0.5),
    item_description: o.description || undefined,
    amount_to_collect: o.amount_to_collect,
  };
  try {
    const res = await pathao.createOrder(order);
    const { error: saveError } = await staff.supabase.rpc('admin_courier_booked', {
      p_order_id: orderId, p_consignment_id: String(res.consignment_id),
      p_fee: Number.isFinite(Number(res.delivery_fee)) ? Math.round(Number(res.delivery_fee)) : null,
      p_courier_status: res.order_status ?? 'Pending',
    });
    // Booked at Pathao but not saved here: say so loudly, with the number, so nobody books it again.
    if (saveError) return { error: `Booked with Pathao (consignment ${res.consignment_id}) but saving failed: ${saveError.message}. Do not send again; note this number.` };
    after(() => kickOutbox(orderId)); // "on its way" SMS/email
    return { ok: `Sent to Pathao. Consignment ${res.consignment_id}.`, consignment: res.consignment_id };
  } catch (err) {
    let message = err instanceof PathaoError ? err.message : 'Unexpected error talking to Pathao.';
    // No answer means Pathao may still have created it: check before sending again.
    if (err.status === 0) message += ` Check Pathao's panel for order ${o.code} before sending again.`;
    await staff.supabase.rpc('admin_courier_release', { p_order_id: orderId, p_error: message });
    const needsArea = err.fields && ['recipient_city', 'recipient_zone', 'recipient_area'].some((f) => f in err.fields);
    return { error: `${err.status >= 400 ? 'Pathao refused' : 'Could not send to Pathao'}: ${message}`, needsArea };
  }
}

export async function sendToPathao(orderId, _prev, formData) {
  const staff = await requireStaff(DISPATCH);
  const r = await book(staff, orderId, {
    weight: formData?.get('weight'), instruction: String(formData?.get('instruction') ?? '').trim(),
    city: formData?.get('city'), zone: formData?.get('zone'), area: formData?.get('area'),
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  return r;
}

// Several confirmed orders at once, one after another (Pathao's bulk endpoint
// doesn't return consignment numbers immediately).
export async function sendManyToPathao(orderIds) {
  const staff = await requireStaff(DISPATCH);
  const ids = [...new Set(orderIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 30);
  const results = [];
  for (const id of ids) results.push({ id, ...(await book(staff, id)) });
  revalidatePath('/admin/orders');
  revalidatePath('/admin', 'layout');
  return { results };
}

export async function refreshPathaoStatus(orderId) {
  const staff = await requireStaff(DISPATCH);
  const { data: o } = await staff.supabase.from('orders').select('courier_consignment_id').eq('id', orderId).maybeSingle();
  if (!o?.courier_consignment_id) return { error: 'This order has no Pathao consignment.' };
  try {
    const info = await pathao.orderInfo(o.courier_consignment_id);
    const status = info?.order_status_slug || info?.order_status;
    if (!status) return { error: 'Pathao returned no status.' };
    await staff.supabase.rpc('admin_courier_note_status', { p_order_id: orderId, p_courier_status: `Pathao: ${status}` });
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: `Pathao says: ${status}` };
  } catch (err) {
    if (!(err instanceof PathaoError)) console.error('pathao:', err.message);
    return { error: err instanceof PathaoError ? err.message : 'Could not reach Pathao.' };
  }
}

// The customer's delivery record across all Pathao merchants. Cached for a day.
export async function pathaoHistory(phone) {
  const staff = await requireStaff();
  if (!can.customers(staff.role)) return fail({ message: 'not_allowed' });
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return { error: 'Invalid phone number.' };
  try {
    const db = supabaseService();
    const { data: cached } = await db.rpc('courier_customer_cache_get', { p_phone: normalized });
    if (cached) return { data: summarizeHistory(cached), cached: true };
    const raw = await pathao.customerHistory(`0${normalized.slice(3)}`);
    await db.rpc('courier_customer_cache_put', { p_phone: normalized, p_data: raw ?? {} });
    return { data: summarizeHistory(raw) };
  } catch (err) {
    if (!(err instanceof PathaoError)) console.error('pathao:', err.message);
    return { error: err instanceof PathaoError ? err.message : 'Could not reach Pathao.' };
  }
}

// Location lists for the "choose area manually" fallback.
export async function pathaoLocations(kind, parentId) {
  await requireStaff(DISPATCH);
  try {
    const rows = kind === 'cities' ? await pathao.cities()
      : kind === 'zones' ? await pathao.zones(parentId)
        : await pathao.areas(parentId);
    return {
      data: rows.map((r) => ({
        id: r.city_id ?? r.zone_id ?? r.area_id ?? r.id,
        name: r.city_name ?? r.zone_name ?? r.area_name ?? r.name,
      })).filter((r) => r.id && r.name),
    };
  } catch (err) {
    if (!(err instanceof PathaoError)) console.error('pathao:', err.message);
    return { error: err instanceof PathaoError ? err.message : 'Could not reach Pathao.' };
  }
}

export async function saveCourierSettings(_prev, formData) {
  const staff = await requireStaff(['admin']);
  const { error } = await staff.supabase.rpc('admin_update_courier_settings', { p: {
    store_id: String(formData.get('store_id') ?? '').trim(),
    default_weight: String(formData.get('default_weight') ?? '').trim(),
    instruction: String(formData.get('instruction') ?? ''),
  } });
  if (error) return fail(error);
  revalidatePath('/admin/settings');
  return { ok: 'Pathao settings saved.' };
}

// Logs in to Pathao and lists your stores, so you can pick the Store ID.
export async function testPathao() {
  await requireStaff(['admin']);
  try {
    const stores = await pathao.stores();
    return { stores: stores.map((s) => ({ id: s.store_id, name: s.store_name, address: s.store_address, active: s.is_active })) };
  } catch (err) {
    if (!(err instanceof PathaoError)) console.error('pathao:', err.message);
    return { error: err instanceof PathaoError ? err.message : 'Could not reach Pathao.' };
  }
}
