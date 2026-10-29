# Deploying and configuring Yojigen Poketto

## Where things live

| Thing | Where |
|---|---|
| Code | GitHub `rakib177269-commits/yojigen-poketto1`, branch `main` |
| Hosting | Netlify project `yojigen-poketto` → https://yojigen-pokettobd.com (domain from Hostinger, DNS run by Netlify) |
| Database, auth, storage | Supabase project `yojigen-poketto` (ref `siucsvsvrpqbfpmbnxlx`, Ohio `us-east-2`), free plan |

## One-time setup (owner)

### 1. Connect Netlify to GitHub (so every push to `main` deploys)
1. Open https://app.netlify.com/projects/yojigen-poketto
2. **Project configuration → Build & deploy → Continuous deployment → Link repository**.
3. Choose **GitHub**, then `rakib177269-commits/yojigen-poketto1`, branch `main`.
4. Leave build settings as detected: `netlify.toml` already sets the build command and the `.next` publish folder.

### 2. Put the Supabase secret key into Netlify
1. Supabase dashboard → project **yojigen-poketto** → **Project Settings → API Keys**.
   Copy the **service_role** key (legacy tab) or create a **secret key** (`sb_secret_…`).
2. Netlify → **Project configuration → Environment variables → Add a variable**:
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: paste the key
   - Tick **Contains secret values**, scopes: all, contexts: all
3. Trigger a new deploy (**Deploys → Trigger deploy → Deploy project**). Env changes only apply after a redeploy.

Never paste this key into chat, code or anything starting with `NEXT_PUBLIC_`.

### 3. Keep the database next to the functions (speed)
Netlify's free plan runs functions in Ohio (US East) and the region can't be changed without a paid plan.
So the database lives in the same region (Supabase `us-east-2`). Customers in Bangladesh still reach the
site through Netlify's nearby CDN; only the server-to-database hop is in Ohio, and it is a few milliseconds.
(Measured after the move: checkout price check 0.5–1.2s → 0.25s, placing an order 1.9s → 0.47s.)
If you ever upgrade Netlify and pick Singapore for functions, move the database to Singapore too.

### 4. Staff sign-in links (Supabase Auth)
Supabase → **Authentication → URL Configuration**:
- Site URL: `https://yojigen-pokettobd.com`
- Redirect URLs: add `https://yojigen-pokettobd.com/**` and `https://www.yojigen-pokettobd.com/**`

Then make email links work on any device. Supabase → **Authentication → Emails → Templates**. In both
**Magic link** and **Confirm signup**, replace the link (`{{ .ConfirmationURL }}`) with:

    {{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=email

Without this, the default link only works in the browser that requested it.
Staff become staff on their first sign-in with an invited, verified email at `/admin/login`.
Supabase's built-in email sends only ~2 emails per hour until Resend is set up (phase 7); staff should
set a password under "My account" after their first sign-in.

### 5. Connect Pathao
1. Pathao merchant panel → **Developer API** → enable **Merchant API Credentials**; copy the Client ID and Client Secret.
2. Netlify → Project configuration → Environment variables → add (mark each **secret**):
   `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, and `PATHAO_WEBHOOK_SECRET` (any long random text you make up).
   Only if "Test connection" later says the login is wrong: also add `PATHAO_USERNAME` / `PATHAO_PASSWORD`
   (the merchant panel email + password). Then **Deploys → Trigger deploy**.
3. Shop admin → **Settings → Pathao courier → Test connection**: it lists your Pathao stores. Put the store's
   ID in "Pathao store ID" and save.
4. Pathao merchant panel → **Developer API → Webhook**: Callback URL `https://yojigen-pokettobd.com/api/webhooks/pathao`,
   secret = the same text as `PATHAO_WEBHOOK_SECRET`, tick all order events, save and press verify. If verification
   fails, copy the value Pathao shows for `X-Pathao-Merchant-Webhook-Integration-Secret` into the Netlify variable
   `PATHAO_WEBHOOK_INTEGRATION_SECRET` and redeploy.
5. Send one real order to Pathao from its order page and watch the timeline update as it moves.

### 6. Facebook and Google tracking
1. Shop admin → **Settings → Marketing**: paste the **Meta Pixel ID** (Events Manager → Data sources) and the
   **GA4 Measurement ID** (`G-…`, GA4 Admin → Data streams). The tags start on shop pages within a minute.
2. Netlify → Environment variables (mark secret, then redeploy):
   - `META_CAPI_TOKEN`: Events Manager → your Pixel → Settings → Conversions API → **Generate access token**.
   - `GA4_API_SECRET`: GA4 Admin → Data streams → your stream → **Measurement Protocol API secrets** → Create.
3. Check Facebook: Events Manager → **Test events** → copy the test code → set `META_TEST_EVENT_CODE` in Netlify,
   redeploy, browse the shop and confirm one order in admin. Within 10 minutes PageView / ViewContent / AddToCart /
   InitiateCheckout (browser + server, deduplicated) and the confirmed order's Purchase show up. Then **delete
   `META_TEST_EVENT_CODE`** and redeploy. Check Google in GA4 → Admin → **DebugView** / Realtime.
4. Verify the domain in Meta Business Settings → Brand safety → Domains (`yojigen-pokettobd.com`).

## Environment variables

| Name | Public? | What it is | Set by |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://siucsvsvrpqbfpmbnxlx.supabase.co` | done |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase publishable key. RLS limits it to reading the active catalogue. | done |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://yojigen-pokettobd.com` | done |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | Lets our server call the order functions. | **owner** (step 2) |

| `PATHAO_CLIENT_ID` / `PATHAO_CLIENT_SECRET` | **SECRET** | Pathao merchant API keys (production context, marked secret) | done |
| `PATHAO_WEBHOOK_SECRET` | server-only | Text Pathao sends with every status update; anything else is refused. Random value set; not marked "secret" in Netlify so the owner can copy it into Pathao's webhook form | done |
| `PATHAO_USERNAME` / `PATHAO_PASSWORD` | **SECRET** | Only for older Pathao accounts that need the login to issue a token | owner, if needed |
| `PATHAO_WEBHOOK_INTEGRATION_SECRET` | secret | Only if Pathao's webhook verification shows a different value | owner, if needed |
| `PATHAO_BASE_URL` | no | Empty = live Pathao. `https://courier-api-sandbox.pathao.com` for testing | optional |

| `META_CAPI_TOKEN` | **SECRET** | Meta Conversions API token (server copies of browser events + Purchase) | **owner** (step 6) |
| `META_TEST_EVENT_CODE` | no | Only while testing in Events Manager → Test events; delete afterwards | optional |
| `META_GRAPH_VERSION` | no | Graph API version, default `v23.0` | optional |
| `GA4_API_SECRET` | **SECRET** | GA4 Measurement Protocol secret (server-side purchase) | **owner** (step 6) |

Later phases add Resend and SMS keys; they will be listed here when built.

## Deploy checks
`netlify.toml` runs, in order: unit tests → database self-tests → `next build` → smoke test of every page.
- Until `SUPABASE_SERVICE_ROLE_KEY` is set, the database self-test is **skipped with a warning** (and checkout can't place orders).
- After each deploy, check the site on a 375px-wide phone screen, not just desktop.

## If something breaks
- **"Edge function has crashed" with no logs, and rolling back doesn't fix it:** Deploys → Trigger deploy → **Deploy project without cache** first.
- **Env var change not showing:** redeploy, since values are baked in at build time.
- **Checkout says "Something went wrong on our side":** the service key is missing or wrong (step 2). Netlify → Logs → Functions shows `SUPABASE_SERVICE_ROLE_KEY is not set`.

## Domain
`yojigen-pokettobd.com` was bought at Hostinger. Its nameservers point to Netlify DNS (`dns1–4.p06.nsone.net`),
so Netlify manages the records, the `www` redirect and the HTTPS certificate. Hostinger's own DNS records are
no longer used. If the domain ever changes:
1. Netlify → **Domain management** → add the new domain; set it as primary.
2. Change `NEXT_PUBLIC_SITE_URL` in Netlify and redeploy.
3. Add a migration updating `private.app_config.site_url` (background jobs call the site there).
4. Supabase → Authentication → URL Configuration: Site URL + Redirect URLs (see step 4 above).
5. Pathao webhook URL (phase 5) and, later, Meta/Google domain settings.
6. Email (Resend) needs SPF/DKIM DNS records on the domain; that step comes in phase 7.

## Before launch (checklist, kept up to date)
- [ ] Remove sample products (a migration deletes `is_sample` products and `/public/sample`)
- [ ] Real delivery times confirmed (outskirts is set to "2–3 days" as a placeholder)
- [ ] Owner reviewed About / Returns / Privacy / Terms text
- [ ] Supabase moved to the Pro plan (free plan pauses after 7 idle days and has no backups); then enable Auth → Leaked password protection
- [ ] Delete the two disabled `claude-test-*@selftest.local` users (Authentication → Users)
