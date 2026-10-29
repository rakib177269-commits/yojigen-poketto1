// Staff sessions (Supabase Auth, cookie based). Server-only.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';

export const ROLES = ['admin', 'manager', 'support', 'packer'];

// A Supabase client acting as the signed-in user. RLS and the role checks in
// the database apply to everything it does.
export async function supabaseUser() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: proxy.js refreshes the session instead.
        }
      },
    },
  });
}

// The current staff member ({user_id, email, name, role}) or null. Once per request.
export const getStaff = cache(async () => {
  const supabase = await supabaseUser();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc('current_staff');
  return data ? { ...data, supabase } : null;
});

// Use at the top of every admin page. Redirects instead of rendering anything
// a visitor may not see; the database enforces the same rules again.
export async function requireStaff(roles = ROLES) {
  const staff = await getStaff();
  if (!staff) redirect('/admin/login');
  if (!roles.includes(staff.role)) redirect('/admin?denied=1');
  return staff;
}

export const can = {
  dashboard: (r) => ['admin', 'manager', 'support'].includes(r),
  confirm: (r) => ['admin', 'manager', 'support'].includes(r),
  dispatch: (r) => ROLES.includes(r),
  deliver: (r) => ['admin', 'manager', 'support'].includes(r),
  edit: (r) => ['admin', 'manager', 'support'].includes(r),
  customers: (r) => ['admin', 'manager', 'support'].includes(r),
  abandoned: (r) => ['admin', 'manager', 'support'].includes(r),
  team: (r) => r === 'admin',
  settings: (r) => r === 'admin',
  export: (r) => r === 'admin',
  audit: (r) => r === 'admin',
};
