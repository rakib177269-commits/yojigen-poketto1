'use server';
// Settings → Marketing: the public tracking ids (Meta Pixel, GA4).
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireStaff } from '../server/auth.js';

const MESSAGES = {
  not_allowed: 'Your role is not allowed to do that.',
  invalid_meta_pixel: 'The Meta Pixel ID is a number, e.g. 123456789012345.',
  invalid_ga4_id: 'The GA4 Measurement ID looks like G-XXXXXXXXXX.',
};

export async function saveTrackingSettings(_prev, formData) {
  const staff = await requireStaff(['admin']);
  const { error } = await staff.supabase.rpc('admin_update_tracking_settings', { p: {
    meta_pixel_id: String(formData.get('meta_pixel_id') ?? ''),
    ga4_id: String(formData.get('ga4_id') ?? ''),
  } });
  if (error) return { error: MESSAGES[error.message] || error.message };
  revalidateTag('settings', { expire: 0 });
  revalidatePath('/admin/settings');
  return { ok: 'Saved. The shop uses the new ids within a minute.' };
}
