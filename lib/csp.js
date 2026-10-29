// Content-Security-Policy, built per request with a fresh nonce (see proxy.js).
//
// Every analytics/pixel vendor is listed ONCE here and its hosts are added to
// script-src, connect-src AND img-src together. GA4 and Meta fall back to image
// beacons; a host missing from img-src silently drops all tracking with no
// console error. tests/csp.test.js checks every vendor appears in all three.
//
// Vendors stay listed even while switched off in admin: allowing a host we
// don't load is harmless; forgetting one we do load is not.

export const VENDORS = {
  meta: {
    script: ['https://connect.facebook.net'],
    connect: ['https://www.facebook.com', 'https://connect.facebook.net'],
    img: ['https://www.facebook.com'],
  },
  ga4: {
    script: ['https://www.googletagmanager.com'],
    connect: [
      'https://www.google-analytics.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://www.googletagmanager.com',
    ],
    img: ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com'],
  },
  tiktok: {
    script: ['https://analytics.tiktok.com'],
    connect: ['https://analytics.tiktok.com'],
    img: ['https://analytics.tiktok.com'],
  },
};

const unique = (list) => [...new Set(list)];
const vendorHosts = (kind) => Object.values(VENDORS).flatMap((v) => v[kind]);

export function buildCsp({ nonce, supabaseUrl, isDev = false, https = true }) {
  const supabase = supabaseUrl ? [supabaseUrl] : [];
  const directives = {
    'default-src': ["'self'"],
    // 'strict-dynamic' lets our nonced loader scripts load the vendor SDKs; the
    // host list is the fallback for browsers without strict-dynamic support.
    'script-src': unique(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...vendorHosts('script'),
      ...(isDev ? ["'unsafe-eval'"] : [])]),
    // React style={...} attributes need 'unsafe-inline' for styles. Scripts never get it.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': unique(["'self'", 'data:', 'blob:', ...supabase, ...vendorHosts('img')]),
    'font-src': ["'self'"],
    'connect-src': unique(["'self'", ...supabase, ...vendorHosts('connect'),
      ...(isDev ? ['ws:'] : [])]),
    'frame-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (https && !isDev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}
