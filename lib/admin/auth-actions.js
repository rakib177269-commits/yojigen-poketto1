'use server';
// Staff sign-in. Email links are sent only to active staff or pending invites;
// the reply is the same either way, so the form can't be used to probe emails.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseUser } from '../server/auth.js';
import { supabaseService } from '../server/supabase.js';
import { SITE } from '../site.js';

const GENERIC = 'If this email belongs to a team member, a sign-in link is on its way. Open it on this device.';

async function clientKey() {
  const h = await headers();
  return h.get('x-nf-client-connection-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function sendSignInLink(_prev, formData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Please enter a valid email address.' };

  let allowed;
  try {
    const { data, error } = await supabaseService().rpc('staff_login_allowed', { p_email: email, p_client_key: await clientKey() });
    if (error) throw error;
    if (data.error === 'rate_limited') return { error: 'Too many attempts. Please wait 10 minutes.' };
    allowed = data.ok;
  } catch (err) {
    console.error('staff login check failed:', err.message);
    return { error: 'Sign-in is unavailable right now. Please try again shortly.' };
  }

  if (allowed) {
    const supabase = await supabaseUser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${SITE.url}/admin/auth/callback`, shouldCreateUser: true },
    });
    if (error) {
      console.error('signInWithOtp failed:', error.message);
      if (/rate|security purposes/i.test(error.message)) {
        return { error: 'Email limit reached for now. Please wait a few minutes and try again.' };
      }
    }
  }
  return { sent: true, message: GENERIC };
}

export async function signInWithPassword(_prev, formData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const supabase = await supabaseUser();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Wrong email or password.' };
  const { data: staff } = await supabase.rpc('claim_staff_invite');
  if (!staff) {
    await supabase.auth.signOut();
    return { error: 'This account does not have staff access.' };
  }
  redirect('/admin');
}

export async function signOut() {
  const supabase = await supabaseUser();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

export async function setPassword(_prev, formData) {
  const password = String(formData.get('password') ?? '');
  if (password.length < 10) return { error: 'Use at least 10 characters.' };
  const supabase = await supabaseUser();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: 'Password saved. You can now sign in with email and password.' };
}
