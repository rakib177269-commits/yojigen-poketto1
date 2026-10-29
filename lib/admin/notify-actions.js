'use server';
// Settings → Customer messages, and test sends for the admin.
import { revalidatePath } from 'next/cache';
import { requireStaff } from '../server/auth.js';
import { sendEmail, sendSms } from '../server/notify.js';
import { normalizeBdPhone } from '../phone.js';

const KINDS = ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

export async function saveNotificationSettings(_prev, formData) {
  const staff = await requireStaff(['admin']);
  const pick = (channel) => Object.fromEntries(KINDS.map((k) => [k, formData.get(`${channel}_${k}`) === 'on']));
  const { error } = await staff.supabase.rpc('admin_update_notification_settings', { p: {
    sms: pick('sms'), email: pick('email'), staff_email: String(formData.get('staff_email') ?? ''),
  } });
  if (error) return { error: error.message === 'invalid_email' ? 'That email address is not valid.' : error.message };
  revalidatePath('/admin/settings');
  return { ok: 'Saved.' };
}

export async function sendTestSms(_prev, formData) {
  await requireStaff(['admin']);
  const phone = normalizeBdPhone(String(formData.get('phone') ?? ''));
  if (!phone) return { error: 'Enter a valid mobile number.' };
  const r = await sendSms(phone, 'Yojigen Poketto: test message. SMS is working.');
  return r.ok ? { ok: 'Sent. Check the phone.' } : { error: `Not sent: ${r.error}` };
}

export async function sendTestEmail(_prev, formData) {
  await requireStaff(['admin']);
  const to = String(formData.get('email') ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: 'Enter a valid email address.' };
  const r = await sendEmail(to, 'Yojigen Poketto: test email', '<p>Email is working.</p>', 'Email is working.');
  return r.ok ? { ok: 'Sent. Check the inbox (and spam).' } : { error: `Not sent: ${r.error}` };
}
