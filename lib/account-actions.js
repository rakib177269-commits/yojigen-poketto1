'use server';
// Customer sign-in with phone + SMS code, profile and sign-out. The database
// rate-limits code requests (per phone and per visitor) and attempts.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseService } from './server/supabase.js';
import { getCustomer, startSession, endSession } from './server/customer-session.js';
import { sendSms, otpText, smsConfigured } from './server/notify.js';
import { formatBdPhone } from './phone.js';

const MESSAGES = {
  invalid_phone: 'Please enter a valid Bangladeshi mobile number (01XXXXXXXXX).',
  rate_limited: 'Too many tries. Please wait a few minutes and try again.',
  code_expired: 'That code has expired. Ask for a new one.',
  too_many_attempts: 'Too many wrong codes. Ask for a new one.',
  wrong_code: 'That code is not right. Check the SMS and try again.',
  invalid_name: 'Name must be 2–80 characters.',
  invalid_email: 'That email address is not valid.',
  email_taken: 'That email is already used by another account.',
};
const message = (code) => MESSAGES[code] || 'Something went wrong. Please try again.';

async function clientKey() {
  const h = await headers();
  return h.get('x-nf-client-connection-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function requestCode(phone) {
  if (!smsConfigured()) return { error: 'Sign-in by SMS is not switched on yet.' };
  const db = supabaseService();
  const { data, error } = await db.rpc('otp_request', { p_phone: String(phone ?? ''), p_client_key: await clientKey() });
  if (error) return { error: message() };
  if (!data.ok) return { error: message(data.error) };
  const sent = await sendSms(data.phone, otpText(data.code));
  if (!sent.ok) {
    console.error('otp sms failed:', sent.error);
    return { error: 'We could not send the SMS right now. Please try again in a minute.' };
  }
  return { ok: true, sentTo: formatBdPhone(data.phone) };
}

export async function verifyCode(phone, code) {
  const db = supabaseService();
  const { data, error } = await db.rpc('otp_verify', {
    p_phone: String(phone ?? ''), p_code: String(code ?? '').slice(0, 12), p_client_key: await clientKey(),
  });
  if (error) return { error: message() };
  if (!data.ok) return { error: message(data.error) };
  await startSession(data.customer_id, data.phone);
  return { ok: true };
}

export async function saveProfile(_prev, formData) {
  const me = await getCustomer();
  if (!me) redirect('/account');
  const { error } = await supabaseService().rpc('customer_update_profile', { p_customer_id: me.customerId, p: {
    name: String(formData.get('name') ?? ''), email: String(formData.get('email') ?? ''),
  } });
  if (error) return { error: message(error.message) };
  revalidatePath('/account');
  return { ok: 'Saved.' };
}

export async function signOut() {
  await endSession();
  redirect('/account');
}
