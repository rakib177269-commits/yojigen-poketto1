// Server-side Supabase clients. Never import this from a 'use client' file.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const options = { auth: { persistSession: false, autoRefreshToken: false } };

let publicClient;
// Anon key: subject to RLS, can only read the active catalogue.
export function supabasePublic() {
  if (!url || !anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set');
  publicClient ??= createClient(url, anonKey, options);
  return publicClient;
}

let serviceClient;
// Service role: only for calling our security-definer RPCs from API routes.
export function supabaseService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY is not set on the server');
    err.code = 'missing_service_key';
    throw err;
  }
  serviceClient ??= createClient(url, key, options);
  return serviceClient;
}
