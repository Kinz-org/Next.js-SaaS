<div align="center">

# Next.js SaaS Boilerplate

### Ship your AI SaaS in days, not months. With AI cost observability that prevents token-bill surprises.

[![Build](https://img.shields.io/github/actions/workflow/status/Kinz-org/Next.js-SaaS/ci.yml?branch=main&label=build&style=flat-square)](https://github.com/Kinz-org/Next.js-SaaS/actions)
[![License](https://img.shields.io/badge/license-MIT%20%2F%20Commercial-blue?style=flat-square)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-brightgreen?style=flat-square)](#)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-green?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-blue?style=flat-square&logo=prisma&logoColor=white)](https://prisma.io)
[![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)](docs/DEPLOYMENT-CLOUDFLARE.md)
[![MCP](https://img.shields.io/badge/MCP-ready-purple?style=flat-square)](docs/MCP-SETUP.md)

<!-- 📹 Replace this comment with your Loom embed once you record the walkthrough:
<a href="https://www.loom.com/share/YOUR_VIDEO_ID">
  <img src="https://cdn.loom.com/sessions/thumbnails/YOUR_VIDEO_ID-with-play.jpg" width="600" alt="2-minute walkthrough" />
</a>
-->

</div>

---

## Why use this?

You're a SaaS founder. You have a product idea. You don't have 6 weeks to wire up auth, RBAC, multi-tenancy, billing, audit logs, GDPR, RAG, and cost metering.

**This boilerplate ships all of that on day one.**

| | Built from scratch | With this boilerplate |
|---|---|---|
| Time to first commit | 0 | 0 |
| Time to working auth + RBAC | 5-7 days | 0 minutes |
| Time to multi-tenant schema | 3-5 days | 0 minutes |
| Time to Stripe + Lemon Squeezy billing | 4-6 days | 0 minutes |
| Time to AI streaming chat + RAG | 5-7 days | 0 minutes |
| Time to GDPR export/erase | 2-3 days | 0 minutes |
| Time to **AI cost observability** | 1-2 weeks | 0 minutes |
| **Total time saved** | - | **4-6 weeks** |

### The Unique Selling Proposition

Every AI SaaS founder gets burned by unexpected token bills. Most boilerplates give you a chat box and call it a day. We don't.

**AI Cost Observability is built into every LLM call:**

- Every token is metered and attributed to `org + user + conversation + model`
- Per-org budget caps fire alerts at 80% / 100% of quota
- Usage-based overage billing reconciled via Stripe metered billing
- Live `/usage` dashboard shows per-day, per-agent, per-user cost breakdowns
- No more "why did OpenAI charge me $400 last month?" panic

### Six systems, pre-integrated

1. **Multi-tenancy** - shared DB with `organizationId` everywhere, RLS as defense-in-depth
2. **RBAC + Audit Log** - type-safe `can(user, "agents:create")` checks, immutable audit trail on every mutation
3. **Billing Engine** - Stripe + Lemon Squeezy, idempotent webhook reconciliation, metered usage (not just a checkout button)
4. **AI Stack** - Vercel AI SDK, multi-provider (Gemini free, Groq free, OpenAI, Anthropic), RAG with pgvector
5. **⭐ AI Cost Observability** - see above
6. **GDPR Compliance** - one-click data export (ZIP), one-click right-to-erasure with audit trail

---

## Quick Start (under 2 minutes)

### Prerequisites

- **Node.js 22.13+** (`node -v`) - required by pnpm 11, which imports the
  `node:sqlite` builtin. On Node 20 you'll get `ERR_UNKNOWN_BUILTIN_MODULE`.
  The repo ships an `.nvmrc`, so `nvm use` picks the right version.
- **pnpm 11+** (`corepack enable` will install the pinned version for you)
- **A Supabase project** (free tier - [create one here](https://supabase.com/dashboard))
- **An LLM API key** - at least one of:
  - ⭐ Google Gemini (free): https://aistudio.google.com/apikey
  - ⭐ Groq (free): https://console.groq.com/keys
  - OpenAI (paid): https://platform.openai.com/api-keys
  - Anthropic (paid): https://console.anthropic.com/settings/keys

### 3 steps

```bash
# 1. Clone + install
git clone https://github.com/Kinz-org/Next.js-SaaS.git
cd Next.js-SaaS
nvm use          # reads .nvmrc → Node 22 (skip if you already run Node 22.13+)
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local - fill in your Supabase URL + anon key + service role key + DATABASE_URL
# And at least one LLM API key (Gemini free works!)

# 3. Set up the database + run
bash scripts/setup.sh
pnpm dev
```

Open http://localhost:3000 - you're live.

### Bonus: MCP-powered development

This is the **only** AI SaaS boilerplate that ships with MCP (Model Context Protocol) pre-configured. Open the project in Cursor, VS Code (with Cline), or Claude Desktop, and your AI assistant can:

- Read your Next.js routes via the `next-devtools` MCP server
- Query your Supabase database via the `supabase` MCP server
- Validate your Prisma schema via the `Prisma` MCP server

See [`docs/MCP-SETUP.md`](docs/MCP-SETUP.md) for the 15-minute setup walkthrough.

---

## ️ Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | RSC, streaming, server actions |
| **Language** | TypeScript (strict, zero `any`) | Type-safe end-to-end |
| **DB** | PostgreSQL (Supabase) + pgvector | One engine for relational + vector + auth + storage |
| **ORM** | Prisma 6 | Type-safe queries, schema-as-code |
| **Auth** | Supabase Auth + RBAC layer | Email/magic link/OAuth, JWT in cookies |
| **UI** | shadcn/ui + Tailwind | Copy-paste components, no lock-in |
| **Validation** | Zod | Shared schemas across client, server, DB |
| **AI** | Vercel AI SDK | Streaming, tool calls, multi-provider |
| **Billing** | Stripe + Lemon Squeezy | MoR option for EU |
| **Testing** | Vitest + Playwright | Modern, App-Router-aware |
| **MCP** | next-devtools + supabase + Prisma | AI-native development |

---

## Project Structure

```
Next.js-SaaS/
├── .mcp.json                     # MCP servers (Cursor/Claude Desktop)
├── prisma/
│   ├── schema.prisma             # 25 models, multi-tenant
│   └── seed.ts                   # Plans, models, permissions, demo data
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── pricing/              # Pricing page
│   │   ├── login/ signup/        # Auth pages (OAuth callback is in api/auth/)
│   │   ├── onboarding/           # First-run org setup
│   │   ├── dashboard/            # Org-scoped app (guarded)
│   │   │   ├── agents/           # AI agent CRUD + chat
│   │   │   ├── knowledge-base/   # RAG upload + search
│   │   │   ├── usage/            # ⭐ AI cost dashboard
│   │   │   └── settings/         # Members, billing, API keys, webhooks, audit, compliance
│   │   └── api/
│   │       ├── chat/             # Streaming AI with cost metering
│   │       ├── webhooks/         # Stripe + Supabase receivers
│   │       ├── cron/             # Usage meter + webhook retry
│   │       └── health/ livez/ readyz/  # Health probes
│   ├── lib/
│   │   ├── ai/                   # llm, embeddings, rag, stream, ⭐ cost
│   │   ├── auth/                 # session, rbac, org-context, permissions
│   │   ├── billing/              # stripe, lemonsqueezy, plans, metering, webhooks
│   │   ├── audit/                # audit logger
│   │   ├── gdpr/                 # export + deletion
│   │   ├── webhooks/             # dispatcher, signer, retry
│   │   ├── supabase/             # client, server, admin, middleware
│   │   └── validators/           # Zod schemas (1:1 with Prisma)
│   ├── components/               # ui + marketing + dashboard + providers
│   └── proxy.ts                  # Auth + org routing (was middleware.ts pre-Next 16)
├── supabase/migrations/          # RLS, audit triggers, vector index
├── docs/                         # ARCHITECTURE, MCP-SETUP, DEPLOYMENT, SECURITY
└── scripts/setup.sh              # One-shot bootstrap
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design rationale.

---

## Pricing & Monetization

This boilerplate is dual-licensed:

- **MIT** - for personal / learning / open-source projects. Free forever.
- **Commercial** - required if you sell a product built on this, or use it internally at a company with >5 developers.

Plans ship pre-configured in the `Plan` table (seeded by `prisma/seed.ts`):

| Plan | Price | Tokens/mo | Seats | Storage |
|---|---|---|---|---|
| Free | $0 | 50K | 1 | 100 MB |
| Starter | $19/mo | 500K | 3 | 1 GB |
| Pro | $49/mo | 5M | 10 | 10 GB |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited |

Customize plans in `src/lib/billing/plans.ts` + `prisma/seed.ts` (single source of truth).

---

## Customization

### Add a new LLM model

1. Add it to the `AVAILABLE_MODELS` array in `src/config/models.ts` (with pricing).
   `prisma/seed.ts` imports that array, so there is no second list to edit.
2. Run `pnpm db:seed`
3. It now appears in the agent creation UI

### Add a new permission / role

1. Add the action string to `DEFAULT_PERMISSIONS` in `src/lib/auth/permissions.ts`
2. Run `pnpm db:seed` (syncs to the `Permission` table)
3. Use `can(user.role, "your:new_action")` in your route guard

### Add a new webhook event

1. Dispatch it from anywhere: `await dispatchWebhookEvent(orgId, "your.event", { ... })`
2. Users subscribe to it from `/dashboard/settings/webhooks`
3. HMAC-signed delivery + exponential backoff retry handled automatically
4. Test a receiver without running the app: `pnpm webhook:tool sign` builds a body in the exact
   shape the dispatcher sends and signs it; `--curl <url>` prints a ready-to-run request with the
   same headers, and `pnpm webhook:tool verify` checks a signature:

   ```bash
   pnpm webhook:tool sign --secret <endpoint secret> --event your.event \
     --payload '{"id":"123"}' --curl http://localhost:4000/hook
   pnpm webhook:tool verify --secret <endpoint secret> --body '<raw body>' --signature <hex>
   ```

---

## Deployment

### Free-tier-friendly deploy (recommended)

Deploy to **Cloudflare Pages** (free, commercial-OK) - see [`docs/DEPLOYMENT-CLOUDFLARE.md`](docs/DEPLOYMENT-CLOUDFLARE.md) for the full guide.

### Vercel

```bash
vercel --prod
```

Add the env vars from `.env.example` in the Vercel dashboard. Configure Stripe webhooks to point to `https://your-domain.com/api/webhooks/stripe`.

### Self-hosted

```bash
pnpm build
pnpm start
```

Use a process manager (PM2, systemd) + a reverse proxy (Caddy, nginx).

---

## Security

- **Row-Level Security** on every tenant-scoped table (see `supabase/migrations/0002_rls_policies.sql`)
- **Service-role key** never exposed to the client (enforced via `lib/supabase/admin.ts`)
- **API keys** stored as argon2 hashes (never plaintext)
- **Webhook signatures** verified with constant-time comparison
- **Audit log** on every mutation (GDPR-friendly)
- **GDPR export/erase** built in (`/dashboard/settings/compliance`)

See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model.

---

## Documentation

| Doc | What's inside |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Folder structure, request lifecycle, design decisions |
| [MCP Setup](docs/MCP-SETUP.md) | 15-minute walkthrough for Cursor / VS Code / Claude Desktop |
| [Deployment](docs/DEPLOYMENT.md) | Vercel + Supabase + Stripe go-live checklist |
| [Security](docs/SECURITY.md) | RLS, audit, GDPR posture, threat model |
| [Contributing](docs/CONTRIBUTING.md) | Branch naming, PR template, commit convention |
| [Changelog](docs/CHANGELOG.md) | Versioned history of changes |

---

## ️ Roadmap

- [x] **v1.1** - Usage dashboard charts (Recharts), per-agent cost breakdown
- [ ] **v1.2** - SSO/SAML for enterprise tier
- [ ] **v1.3** - Realtime presence (Supabase Realtime) for collaborative chat
- [ ] **v1.4** - Edge Functions for hot-path queries (latency < 50ms)
- [ ] **v2.0** - White-label mode (custom branding per org)

---

## Contributing

PRs welcome! Please read [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) first.

1. Fork the repo
2. Create a branch: `feat/your-feature` or `fix/your-bugfix`
3. Run `pnpm test && pnpm build` before submitting
4. Open a PR with a clear description

---

## Hire the author

Building a custom AI SaaS? Need help architecting your multi-tenant system? I'm available for:

- **Fractional CTO / Architect** engagements (1-3 days/week)
- **Code reviews** of existing AI SaaS codebases
- **Custom features** built on top of this boilerplate

Email: nassim.kefi0014@gmail.com
GitHub: [@nassim0014](https://github.com/nassim0014)

---

## License

Dual-licensed under [MIT](LICENSE) (personal/learning) and Commercial (production SaaS).

Commercial terms are in [COMMERCIAL.md](COMMERCIAL.md). Purchasing the Commercial License funds ongoing development.

---

<div align="center">

**⭐ Star this repo if it saved you time. ⭐**

Built with care by [@nassim0014](https://github.com/nassim0014) · Powered by Next.js 16, Supabase, Prisma, and the Model Context Protocol.

</div>
