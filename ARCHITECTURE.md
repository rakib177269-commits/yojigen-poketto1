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
Uploads: the browser shrinks a photo to at most 2400px (keeps Netlify's 6 MB request limit) and posts it
to `/api/admin/upload` (admin/manager only), where `sharp` fixes phone rotation and writes WebP sizes into
the public `product-images` bucket under `products/<uuid>/<uuid>` or `banners/...`. It never upscales.
The product/banner row that points at the files is saved separately by a role-checked `admin_save_*`
function, which only accepts keys of that exact shape. Files nobody points at (abandoned uploads,
removed photos, deleted products) are removed by the nightly `sweep-orphan-images` pg_cron job, which
calls `/api/sweep/storage` with a secret header (secret kept in Supabase Vault); running it twice is harmless.

**Catalogue management.** Products (colours, photos with drag/arrow ordering, rich-text description
cleaned by `lib/sanitize.js`, SEO fields), bulk status/price/%/stock changes, categories, banners
(separate desktop and mobile images, optional schedule) and coupons all write through `admin_*`
functions. Spreadsheet import (`docs/product-upload-template.xlsx`) is checked first, refuses titles that
already exist, then imports all rows or none (`admin_import_products`); photos are matched to products
by the file names listed in the sheet.

**Staff and roles.** Staff sign in with Supabase Auth (email link, optional password). `private.staff_role()`
reads the `staff` table; RLS policies and every `admin_*` function check it, so the UI hiding a button is
only a convenience. A pending invite becomes a staff row the first time that *verified* email signs in.
`private.audit()` triggers record every write made by a signed-in user (who, role, table, row, before/after).
Packers only ever see confirmed/dispatched orders. `admin_set_status` can never set `confirmed`; that is only
`admin_confirm_order`, which also sets `marketing_status = confirmed` for the phase 6 Purchase sweep.

**Courier (Pathao).** `lib/server/pathao.js` talks to Pathao with secrets from the environment; its
access token is cached in the database (`private.courier_tokens`) so all serverless functions share it.
Booking: `admin_courier_claim` (role check, order must be confirmed, 2-minute lock against double clicks)
→ Pathao create-order → `admin_courier_booked` (consignment saved, order → dispatched) or
`admin_courier_release` (lock freed, internal note with Pathao's reason). Pathao's webhook
(`/api/webhooks/pathao`, header `X-PATHAO-Signature` must equal `PATHAO_WEBHOOK_SECRET`) feeds
`courier_webhook`: each payload is stored once (hash), progress becomes order events (customer-facing ones
show on the tracking page), `delivered` and `returned` change the order status (returned restocks), and an
event can never move an order backwards. The Pathao customer history (all merchants) is fetched on demand
and cached for a day.

**Marketing (Meta + GA4).** Tracking ids live in Settings (public); tokens in Netlify. `components/Pixels.js`
renders one nonced inline loader on shop pages only (admin never gets tags) and defines `window.__ypTrack`,
which `lib/track.js` calls: Meta Pixel + GA4 events in the browser, and for Meta a server copy through
`/api/capi` with the same event id (Meta deduplicates; ad blockers can't drop it). `/api/capi` only accepts
PageView, ViewContent, AddToCart, InitiateCheckout, Search, AddToWishlist; it refuses Purchase, is rate
limited and same-origin. **Purchase** is sent only by `/api/sweep/marketing` (pg_cron every 10 minutes) for
orders with `marketing_status = confirmed`, claimed in the database so overlapping runs can't double-send,
with event id `purchase-<order code>`, hashed phone/email/name, fbp/fbc, IP and user agent from checkout,
and the GA4 client id from the `_ga` cookie (kept in the order's `utm`). Per-vendor results are recorded
(`capi_sent_at`, `marketing_sent`, `capi_last_error`, max 5 attempts) and shown on the order page.
TikTok was dropped at the owner's request (the database still accepts a TikTok id but nothing uses it).

**Customer messages.** An outbox (`private.notifications`, unique per order + channel + kind) filled by a
trigger on orders: placed / confirmed / dispatched / delivered / cancelled (never for rejected orders), plus a
"new order" email to the owner. Which channel sends what is set in Settings (defaults: SMS on confirmed and
dispatched only, since SMS costs money; email on everything). `lib/server/notify.js` sends via Resend (email)
and BulkSMSBD or Alpha SMS (`SMS_PROVIDER`); it runs right after the change (`after()`, so the page isn't
slowed) and from `/api/sweep/notify` every 5 minutes for retries (max 5 tries). Without a provider a message
is marked "skipped", never sent late. SMS texts are plain ASCII under 160 characters (one SMS each).

**Customer accounts.** Phone number + 6-digit SMS code (`otp_request` / `otp_verify`: only a hash is stored,
5 minutes, 5 tries, max 3 codes per number per 15 minutes and 10 per visitor per hour). The server then sets
`yp_session`, an HttpOnly cookie signed with HMAC-SHA256 using a secret in Supabase Vault (rotating it signs
everyone out once functions restart). `/account` lists the customer's orders (never rejected ones) and lets
them save name/email; checkout is pre-filled from their last order. Google sign-in was left out on purpose
(needs a Google Cloud app; phone sign-in is what Bangladeshi shoppers expect).

**Backups.** `.github/workflows/backup.yml`: Supabase CLI `db dump` (roles, schema, data) over the session
pooler every night, tar + AES-256 (openssl, PBKDF2) with a passphrase secret, 30-day artifact. Encryption is
required because the repository is public. Storage files are not included.

**Tests.** `run_self_tests()` in the database runs 38 checks (phones, zones in Bangla and English,
coupons, free delivery, stock, place_order) inside a transaction that is always rolled back, so it is
safe on production. `run_admin_self_tests()` adds 16 role/permission checks and
`run_catalog_self_tests()` 13 catalogue checks and `run_courier_self_tests()` 13 Pathao booking/webhook
checks, `run_marketing_self_tests()` 7 Purchase-reporting checks and `run_messages_self_tests()` 13
message/sign-in checks the same way. Unit tests cover the JS side. A smoke test renders every page after the build.

## Status by phase

| Phase | Status |
|---|---|
| 1. Schema, RLS, core RPCs | Done |
| 2. Storefront, checkout, COD orders | Live; full order journey verified on the live site at 375px |
| 3. Admin panel, staff roles, audit | Done: dashboard, orders (confirm / reject / status / edit / manual / invoice / CSV), customer check, abandoned carts, team, settings + maintenance mode, audit log. Browser-tested at 375px with temporary admin + packer accounts |
| 4. Image upload, catalogue management | Built. Products, colours, categories, coupons, bulk edit and spreadsheet import browser-tested at 375px and desktop against the real database. Live photo upload and delete buttons are tested once migration 0013 is applied |
| 5. Pathao | Built and tested without live Pathao keys: booking (single + bulk), retry after failure, manual city/zone fallback, webhook (verify, signature, duplicates, delivered/returned), status refresh, customer history. First real booking waits for the owner's Pathao keys |
| 6. Meta Pixel + CAPI, GA4 | Built: tags on shop pages only, server mirror, Purchase after confirmation only. Browser-tested with dummy ids (no CSP violations, Purchase refused in browser and at /api/capi, nothing on admin). Real check in Meta Test Events / GA4 DebugView waits for the owner's ids and tokens. TikTok dropped |
| 7. Emails, SMS, accounts | Built: message outbox + Settings, SMS sign-in, account page, checkout pre-fill. Tested: database rules (13 checks), live 5-minute job (messages correctly skipped without providers), account/settings/order pages at 375px. Real sending waits for the owner's Resend + SMS keys |
| 8. Backups, SEO polish, launch | Built: encrypted nightly backup workflow (needs 2 GitHub secrets), shop + search structured data, HSTS, 13 foreign-key indexes from the Supabase advisor, one-click sample removal, launch checklist in DEPLOY.md. Speed: first paint under 0.4 s locally, ~140 KB compressed JS |

## Known gaps (honest list)

- **Old Singapore database** (`yojigen-poketto-shop`) is paused, not deleted. It holds only one test
  order. Delete it from the Supabase dashboard once you're happy with the Ohio one.
- **Staff sign-in by email link** depends on Supabase's built-in email sender (a few emails per hour) until
  Resend is set up in phase 7. The link must be opened in the same browser that requested it.
- **Pathao API details** were taken from Pathao's published API as used by open-source integrations;
  Pathao's own docs site is blocked from the build machine. The first real booking is the final check
  (store ID, phone format, webhook verification value). Pathao's customer-history answer format is read
  defensively; if it changes, the order page says "no usable history" rather than guessing.
- **Temporary test accounts** `claude-test-admin@selftest.local` and `claude-test-packer@selftest.local`
  are disabled and locked; delete them in Supabase → Authentication → Users. Five cancelled test orders
  (names starting "TEST") remain for the record.
- **Migrations 0010 and 0013** were applied by the owner in the SQL editor (the Supabase connector's
  confirmation prompt could not be answered); they are recorded in the migration history like the others.
- **Customer accounts** need an SMS provider; until one is set, /account explains that accounts open soon and checkout stays guest-only.
- **Signed-in view not clicked through live**: signing a test cookie with the live secret was (rightly) blocked; it is covered by unit tests (cookie signing/forgery/expiry) and the database tests, and the forged-cookie case was checked in the browser. The secret was rotated afterwards.
- **Double-submit protection** is the disabled button only; a network retry could in theory place a
  second order. An idempotency key is planned with the admin work.
- **Outskirts delivery time** "2–3 days" is a placeholder until the owner confirms it.
- **Supabase free plan** pauses after 7 days without traffic and has no automatic backups (the GitHub backup
  covers the database once its secrets are added).
- **Advisor notes left as they are:** `pg_net` lives in the public schema (moving it would break the scheduled
  jobs for no real gain); the `staff` read policy calls `auth.uid()` per row (tiny table); "multiple permissive
  policies" on catalogue tables are the intended public + staff pair; leaked-password protection needs Pro.
