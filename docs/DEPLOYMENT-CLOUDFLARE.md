# Cloudflare Pages Deployment

> Deploy this boilerplate to Cloudflare Pages for free + commercial-OK hosting.
> Vercel's free Hobby tier prohibits commercial use; Cloudflare Pages does not.

## Why Cloudflare Pages?

| | Vercel Hobby | Cloudflare Pages |
|---|---|---|
| Free tier | ✅ | ✅ |
| Commercial use on free | ❌ (ToS violation) | ✅ |
| Bandwidth | 100 GB/mo | Unlimited |
| Build minutes | 6,000/mo | 500/mo |
| Edge network | ✅ | ✅ (faster in some regions) |
| Next.js support | Native | Via `@opennextjs/cloudflare` |

## ️ Known risk: this path is unverified, not turnkey

Two dependencies this boilerplate relies on are very likely incompatible
with the Cloudflare Workers/Pages runtime, even with `nodejs_compat`
enabled in `wrangler.toml`:

- **`argon2`** (used for API-key hashing, see `docs/SECURITY.md`) is a
  native Node addon - it ships a compiled `.node` binary built via
  `node-gyp`/`napi`. `nodejs_compat` polyfills Node.js *APIs*; it does not
  load compiled native addons. This will very likely fail to load (or fail
  to build) on Cloudflare.
- **Prisma's default query engine** (`generator client { provider =
  "prisma-client-js" }` in `prisma/schema.prisma`, with no
  `driverAdapters` preview feature or Prisma Accelerate configured) needs
  its native Rust query-engine binary at runtime. That's not deployable to
  Cloudflare Workers without switching to Driver Adapters (e.g.
  `@prisma/adapter-pg`) or Prisma Accelerate - neither is set up here.
  `src/lib/prisma.ts` also directly touches `node:dns` low-level APIs,
  which are generally unsupported/no-op under `nodejs_compat`.
- Neither `@opennextjs/cloudflare` nor `wrangler` are pinned as
  dependencies in `package.json` - the build command below relies on `npx`
  fetching an unpinned version of the Cloudflare adapter at deploy time,
  so the build isn't reproducible or CI-tested the way the Vercel path is.

None of this has been fixed in the codebase - doing so is a real
architecture change (driver adapters, swapping `argon2` for a
Workers-compatible hash, pinning the Cloudflare tooling) with its own risk
of introducing new bugs, not something to bundle into a doc update. If you
hit a build or runtime failure following this guide, these three points are
the most likely cause - start there. **Vercel is the better-tested
deployment target for this boilerplate today**; treat Cloudflare Pages as
experimental until the above is actually addressed.

## Prerequisites

1. A Cloudflare account (free): https://dash.cloudflare.com/sign-up
2. The boilerplate repo cloned locally
3. All env vars ready (see `.env.example`)

## Option A - Deploy via Cloudflare Dashboard (easiest)

1. Go to https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. Select your `Kinz-org/Next.js-SaaS` GitHub repo
3. Configure build:
   - **Framework preset:** Next.js
   - **Build command:** `npx @opennextjs/cloudflare && pnpm build`
   - **Build output directory:** `.open-next`
   - **Node version:** 20 (set `NODE_VERSION=20` env var)
4. Add environment variables (Settings → Environment variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (use Supabase connection pooler URL)
   - `DIRECT_URL` (same as DATABASE_URL for Supabase)
   - `GOOGLE_GENERATIVE_AI_API_KEY` (or other LLM provider key)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `CRON_SECRET` (generate with `openssl rand -hex 32`)
   - `WEBHOOK_SIGNING_SECRET`
   - `NODE_VERSION=20`
5. Save + Deploy. First build takes 3-5 minutes.

## Option B - Deploy via Wrangler CLI

```bash
# 1. Install wrangler
pnpm add -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Build the project
pnpm build

# 4. Deploy
wrangler pages deploy .open-next --project-name=nextjs-saas
```

## Configure environment variables

After the first deploy, set your env vars in the Cloudflare dashboard (Workers & Pages → your project → Settings → Environment variables). They are NOT read from `.env.local` in production - they must be set in Cloudflare.

## Set up custom domain

1. In Cloudflare Pages → your project → Custom domains → Set up a domain
2. Add `your-saas-demo.com` (or whatever domain you own)
3. Cloudflare auto-provisions SSL
4. Update `NEXT_PUBLIC_APP_URL` to your domain
5. Update Supabase Auth redirect URLs to include your domain
6. Update Stripe webhook URL to `https://your-domain.com/api/webhooks/stripe`

## Set up cron jobs

Cloudflare Cron Triggers fire on a schedule and hit your API routes:

1. In `wrangler.toml`, add:
   ```toml
   [triggers]
   crons = ["0 0 * * *", "0-59/5 * * * *"]
   ```
2. Or configure in dashboard: Workers & Pages → your project → Triggers → Cron Triggers
3. Both routes (`/api/cron/usage-meter`, `/api/cron/webhook-retry`) require the `Authorization: Bearer <CRON_SECRET>` header - Cloudflare Cron Triggers can be configured to send custom headers.

## Verify the deployment

- [ ] Visit `https://your-project.pages.dev/api/readyz` → returns `{"status":"ready"}`
- [ ] Visit `https://your-project.pages.dev/` → marketing landing renders
- [ ] Sign up + create org → redirects to `/dashboard`
- [ ] Create an agent + chat → token usage appears in `/dashboard/usage`

## Known limitations on Cloudflare

- **`argon2` and Prisma's native engine** - see the risk callout above; these are the most likely source of a build or runtime failure, not a vague "some modules may not work"
- **Build memory** - Cloudflare's build environment has 3GB RAM limit; the boilerplate fits comfortably
- **No persistent filesystem** - files must use Supabase Storage (we already do)

## Rollback

Cloudflare Pages keeps every deployment. To rollback:

1. Go to your project → Deployments
2. Find the last working deployment
3. Click "Rollback to this deployment"

Instant - no rebuild required.
