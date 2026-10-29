# Architecture

## Overview

```
Browser ──► Netlify (Next.js 16)
              ├─ proxy.js            per-request CSP nonce, noindex headers
              ├─ pages               server-rendered; catalogue reads cached (tag "catalog")
              └─ app/api/*           quote, orders, track, cart-capture, newsletter
                     │ service role (server only)
                     ▼
            Supabase Postgres ── RLS on every table
              ├─ anon key: SELECT active products/variants/images, categories, live banners
              └─ security-definer functions: place_order, quote_order, track_order, ...
```

## Key decisions

**The database decides every price.** `private.price_cart()` is the single pricing function, used both
for the live checkout preview (`quote_order`) and for `place_order`, so the preview and the real order
cannot disagree. It re-reads prices from `products`, works out the delivery zone from the address,
validates the coupon and applies free delivery (from ৳2,000 after discount). `place_order` then
decrements stock with conditional updates (`stock >= qty`), counts coupon use atomically, and marks the
customer's abandoned cart recovered, all in one transaction. Prices and totals sent by the browser are ignored.

**Writes are server-only functions.** All write RPCs are granted to `service_role` only. The browser calls
our API routes, which add the real client IP (`x-nf-client-connection-ip`) for rate limiting inside the
database (`private.hit_rate_limit`). Migration 0007 removes Postgres' default `EXECUTE` to `PUBLIC`,
which would otherwise have let anyone call `place_order` directly. Limits: orders 8/10 min per IP and
5/hour per phone, coupon checks 40/10 min, tracking 15/10 min, cart capture 30/10 min, newsletter 5/10 min.

**Bangla input.** Phone numbers: Bangla digits are converted *before* non-digits are stripped, then
normalised to `8801XXXXXXXXX` (`lib/phone.js` and `private.normalize_bd_phone`, kept identical).
Addresses: `private.loose_text` applies Unicode NFC (so ড়/য় typed either way match), lower case and
common spelling variants (ী/ি, ূ/ু, ণ/ন, gonj/ganj). Zones are checked in priority order: outskirts →
named districts outside Dhaka → Dhaka areas and the word "Dhaka" → default "outside Dhaka". So
"সাভার, ঢাকা" is outskirts and "Tangail, Dhaka division" is outside Dhaka.

**CSP.** `proxy.js` (Next 16 renamed `middleware.js` to `proxy.js`) builds a fresh nonce per request.
`lib/csp.js` lists each analytics vendor once and adds its hosts to `script-src`, `connect-src` and
`img-src` together; `tests/csp.test.js` enforces it. Styles allow `'unsafe-inline'` (React style
attributes); scripts never do. Because of the nonce every page renders per request, so speed comes from
caching the *data* (`unstable_cache`, tag `catalog`, 10-minute fallback), not whole pages.

**Images.** Stored as WebP at several widths (`<key>-<width>.webp`) and served with `srcset`; the product
is never cropped (`object-fit: contain` on a neutral background). Sample images are bundled in
`/public/sample` until launch.

**Staff and roles.** Staff sign in with Supabase Auth (email link, optional password). `private.staff_role()`
reads the `staff` table; RLS policies and every `admin_*` function check it, so the UI hiding a button is
only a convenience. A pending invite becomes a staff row the first time that *verified* email signs in.
`private.audit()` triggers record every write made by a signed-in user (who, role, table, row, before/after).
Packers only ever see confirmed/dispatched orders. `admin_set_status` can never set `confirmed`; that is only
`admin_confirm_order`, which also sets `marketing_status = confirmed` for the phase 6 Purchase sweep.

**Tests.** `run_self_tests()` in the database runs 38 checks (phones, zones in Bangla and English,
coupons, free delivery, stock, place_order) inside a transaction that is always rolled back, so it is
safe on production. `run_admin_self_tests()` adds 16 role/permission checks the same way. Unit tests cover the JS side. A smoke test renders every page after the build.

## Status by phase

| Phase | Status |
|---|---|
| 1. Schema, RLS, core RPCs | Done |
| 2. Storefront, checkout, COD orders | Live; full order journey verified on the live site at 375px |
| 3. Admin panel, staff roles, audit | Done: dashboard, orders (confirm / reject / status / edit / manual / invoice / CSV), customer check, abandoned carts, team, settings + maintenance mode, audit log. Browser-tested at 375px with temporary admin + packer accounts |
| 4. Image upload, catalogue management | Not started |
| 5. Pathao | Not started |
| 6. Meta Pixel + CAPI, GA4, TikTok | Not started; `lib/track.js` is a no-op until then, and fbp/fbc/landing URL are already stored on orders |
| 7. Emails, SMS OTP, accounts | Not started |
| 8. Backups, SEO polish, launch | Not started |

## Known gaps (honest list)

- **Old Singapore database** (`yojigen-poketto-shop`) is paused, not deleted. It holds only one test
  order. Delete it from the Supabase dashboard once you're happy with the Ohio one.
- **Staff sign-in by email link** depends on Supabase's built-in email sender (a few emails per hour) until
  Resend is set up in phase 7. The link must be opened in the same browser that requested it.
- **Customer check** uses only our own order history; Pathao's data arrives with phase 5.
- **Temporary test accounts** `claude-test-admin@selftest.local` and `claude-test-packer@selftest.local`
  are disabled and locked; delete them in Supabase → Authentication → Users. Five cancelled test orders
  (names starting "TEST") remain for the record.
- **Migration 0010** was applied by the owner in the SQL editor (the Supabase connector's confirmation
  prompt could not be answered); it is recorded in the migration history like the others.
- **Customer accounts** (phone OTP, email, Google) are phase 7; checkout is guest-only for now.
- **Double-submit protection** is the disabled button only; a network retry could in theory place a
  second order. An idempotency key is planned with the admin work.
- **Outskirts delivery time** "2–3 days" is a placeholder until the owner confirms it.
- **Supabase free plan** pauses after 7 days without traffic and has no automatic backups.
