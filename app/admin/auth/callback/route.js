// The email sign-in link lands here. Exchanges the one-time code for a session
// (same browser only: the code verifier lives in a cookie), then turns a
// pending invite for this verified email into staff access.
import { NextResponse } from 'next/server';
import { supabaseUser } from '../../../../lib/server/auth.js';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const back = (msg) => NextResponse.redirect(new URL(`/admin/login?error=${msg}`, url));
  if (!code) return back('link');

  const supabase = await supabaseUser();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('exchangeCodeForSession:', error.message);
    return back('link');
  }
  const { data: staff } = await supabase.rpc('claim_staff_invite');
  if (!staff) {
    await supabase.auth.signOut();
    return back('access');
  }
  return NextResponse.redirect(new URL('/admin', url));
}
