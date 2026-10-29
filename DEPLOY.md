# Deploying and configuring Yojigen Poketto

## Where things live

| Thing | Where |
|---|---|
| Code | GitHub `rakib177269-commits/yojigen-poketto1`, branch `main` |
| Hosting | Netlify project `yojigen-poketto` → https://yojigen-poketto.netlify.app |
| Database, auth, storage | Supabase project `yojigen-poketto-shop` (ref `zvmryutfmbqdidulxrlv`, Singapore), free plan |

## One-time setup (owner)

### 1. Connect Netlify to GitHub (so every push to `main` deploys)
1. Open https://app.netlify.com/projects/yojigen-poketto
2. **Project configuration → Build & deploy → Continuous deployment → Link repository**.
3. Choose **GitHub**, then `rakib177269-commits/yojigen-poketto1`, branch `main`.
4. Leave build settings as detected: `netlify.toml` already sets the build command and the `.next` publish folder.

### 2. Put the Supabase secret key into Netlify
1. Supabase dashboard → project **yojigen-poketto-shop** → **Project Settings → API Keys**.
   Copy the **service_role** key (legacy tab) or create a **secret key** (`sb_secret_…`).
2. Netlify → **Project configuration → Environment variables → Add a variable**:
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: paste the key
   - Tick **Contains secret values**, scopes: all, contexts: all
3. Trigger a new deploy (**Deploys → Trigger deploy → Deploy project**). Env changes only apply after a redeploy.

Never paste this key into chat, code or anything starting with `NEXT_PUBLIC_`.

### 3. Run functions next to the database (speed)
Netlify → **Project configuration → Build & deploy → Functions region** → **Asia Pacific (Singapore)** → save, then redeploy.
By default functions run in Ohio (USA), and every page would make several round trips to Singapore.

## Environment variables

| Name | Public? | What it is | Set by |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://zvmryutfmbqdidulxrlv.supabase.co` | done |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase publishable key. RLS limits it to reading the active catalogue. | done |
| `NEXT_PUBLIC_SITE_URL` | yes | `https://yojigen-poketto.netlify.app` (change when the domain is connected) | done |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** | Lets our server call the order functions. | **owner** (step 2) |

Later phases add Pathao, Meta CAPI, GA4, TikTok, Resend and SMS keys; they will be listed here when built.

## Deploy checks
`netlify.toml` runs, in order: unit tests → database self-tests → `next build` → smoke test of every page.
- Until `SUPABASE_SERVICE_ROLE_KEY` is set, the database self-test is **skipped with a warning** (and checkout can't place orders).
- After each deploy, check the site on a 375px-wide phone screen, not just desktop.

## If something breaks
- **"Edge function has crashed" with no logs, and rolling back doesn't fix it:** Deploys → Trigger deploy → **Deploy project without cache** first.
- **Env var change not showing:** redeploy, since values are baked in at build time.
- **Checkout says "Something went wrong on our side":** the service key is missing or wrong (step 2). Netlify → Logs → Functions shows `SUPABASE_SERVICE_ROLE_KEY is not set`.

## Connecting a domain (later)
1. Buy the domain. Netlify → **Domain management → Add a domain** → follow the DNS instructions (Netlify DNS or your registrar's records).
2. Change `NEXT_PUBLIC_SITE_URL` to `https://yourdomain` and redeploy.
3. Email (Resend) needs SPF/DKIM DNS records on the domain; that step comes in phase 7.

## Before launch (checklist, kept up to date)
- [ ] Remove sample products (a migration deletes `is_sample` products and `/public/sample`)
- [ ] Real delivery times confirmed (outskirts is set to "2–3 days" as a placeholder)
- [ ] Owner reviewed About / Returns / Privacy / Terms text
- [ ] Supabase moved to the Pro plan (free plan pauses after 7 idle days and has no backups)
