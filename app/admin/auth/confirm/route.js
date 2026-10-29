// Email links that carry a token_hash (see DEPLOY.md, Supabase email templates).
// Unlike the ?code= flow, this works on ANY device: you can request the link on
// a computer and open it in the Gmail app on your phone.
import { NextResponse } from 'next/server';
import { supabaseUser } from '../../../../lib/server/auth.js';

const TYPES = new Set(['email', 'magiclink', 'signup', 'invite', 'recovery']);

export async function GET(request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const back = (msg) => NextResponse.redirect(new URL(`/admin/login?error=${msg}`, url));
  if (!tokenHash || !TYPES.has(type)) return back('link');

  const supabase = await supabaseUser();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.error('verifyOtp:', error.message);
    return back('link');
  }
  const { data: staff } = await supabase.rpc('claim_staff_invite');
  if (!staff) {
    await supabase.auth.signOut();
    return back('access');
  }
  // A password-reset link lands on My account so a new password can be set.
  return NextResponse.redirect(new URL(type === 'recovery' ? '/admin/account?reset=1' : '/admin', url));
}
