# Yojigen Poketto

Online shop for gadgets, gifts, cute items and accessories in Bangladesh.
Cash on Delivery, Pathao courier, mobile-first.

- **Live:** https://yojigen-poketto.netlify.app
- **Stack:** Next.js 16 (App Router) on Netlify, Supabase (Postgres, Auth, Storage, pg_cron)
- **Docs:** [DEPLOY.md](DEPLOY.md) (settings and env vars), [ARCHITECTURE.md](ARCHITECTURE.md) (what was built and why)

## Run it locally

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # then fill in the values (see DEPLOY.md)
npm run dev                  # http://localhost:3000
```

## Tests

```bash
npm test             # unit tests: phone numbers, CSP, HTML sanitiser, formatting
npm run test:db      # database self-tests (prices, fees, coupons, stock), needs the service key
npm run build && npm run test:smoke   # every page renders
```

Netlify runs all three on every deploy (`netlify.toml`); a failure stops the deploy.

## Project layout

```
app/(shop)/          storefront pages (home, shop, product, checkout, order, track, policies)
app/api/             JSON endpoints called by the browser (quote, orders, track, ...)
components/          React components ("use client" ones run in the browser)
lib/                 shared helpers (phone, CSP, images, formatting); lib/server/ is server-only
proxy.js             per-request Content-Security-Policy nonce + noindex headers
supabase/migrations/ numbered SQL migrations: the only way the database changes
scripts/             test runners, sample image generator
docs/                product upload spreadsheet template
```

## Database changes

Never change the database by hand. Add a new numbered file in `supabase/migrations/`
(e.g. `0008_something.sql`), apply it, and commit it.
