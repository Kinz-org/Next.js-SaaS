# Contributing

Thanks for your interest in improving this boilerplate! This doc covers the basics.

## Setup

```bash
git clone https://github.com/Kinz-org/Next.js-SaaS.git
cd Next.js-SaaS
pnpm install
cp .env.example .env.local
# Fill in your Supabase credentials
pnpm db:generate && pnpm db:push && pnpm db:seed
pnpm dev
```

## Branch naming

- `feat/<short-description>` - new features
- `fix/<short-description>` - bug fixes
- `docs/<short-description>` - documentation only
- `chore/<short-description>` - build, deps, tooling

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(billing): add Stripe metered usage support
fix(auth): handle expired session in middleware
docs(readme): update Quick Start section
chore(deps): bump prisma to 6.1
```

## Before submitting a PR

1. Run `pnpm lint` - fix any errors
2. Run `pnpm typecheck` - must pass with no errors
3. Run `pnpm test` - all tests must pass
4. Run `pnpm build` - production build must succeed
5. Add tests for any new functionality

## PR template

```markdown
## What

Brief description of what this PR changes.

## Why

The motivation behind the change.

## How

Key implementation decisions.

## Testing

How you tested this. If you added tests, mention them.

## Breaking changes

List any breaking changes, or write "None".
```

## Code style

- **TypeScript strict mode** - no `any`, use `unknown` + type guards
- **Zod for validation** - never validate inline
- **Server Actions over API routes** where possible
- **Every mutation gets an audit log entry** - use `lib/audit/logger.ts`
- **Tenant-scoped queries must filter by `organizationId`** - never bypass
- **Money is `Int` cents** - never floats
