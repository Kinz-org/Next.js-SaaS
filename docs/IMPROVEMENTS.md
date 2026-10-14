# Improvements Backlog

Created by the closed-improvement-loop's first visit to this repo (2026-08-19). Ranked by
impact; each item is scoped to be one reviewable PR. Pick the top unblocked item on future
cycles rather than the easiest one.

**Status (2026-10-14):** items 1–8 (first numbering) are done, and so are items 6 and 7
(re-numbered: `metering.ts` coverage, done 2026-10-02; `dispatcher.ts` coverage, done
2026-10-14). Open, in priority order: items 9–14. Item 7 (rate limiting, first numbering) was
done 2026-09-04 but **only for `/api/chat`**; the other three unprotected routes it names are
still open — see the item for the carried-forward scope note.

This file was removed in the 2026-10-02 "Docs and formatting cleanup" commit and restored on
2026-10-14 by the improvement loop, which reads its open items from here. Items 9–13 were
re-checked against `main` on 2026-10-14 and all still apply.

**Heads-up for the next cycle (2026-09-04):** ~~`main` is currently red for reasons unrelated to
any backlog item.~~ **Resolved by PR #80** (`fix: migrate ai SDK v4→v7 call sites, fix lint, fix
Google provider runtime crash`) — confirmed on the current `main`: `pnpm typecheck`, `pnpm lint`,
`pnpm test`, and `pnpm build` are all clean. Leaving the original note below for history.

The Dependabot bump of `ai` 4.3.19 → 7.0.84 (PR #77) is a major-version SDK
break that was merged without migrating the call sites — `pnpm typecheck` fails with 18 errors
across `src/app/api/chat/route.ts`, `src/lib/ai/stream.ts`, `src/lib/ai/llm.ts` and
`src/lib/ai/embeddings.ts` (`CoreMessage`, `LanguageModelV1`, `maxTokens`,
`usage.promptTokens` / `completionTokens`, `toDataStreamResponse` all moved or were renamed in
v5+). Separately, `eslint-config-next` 16.3.3 (PR #76) added a rule that makes
`src/app/signup/page.tsx:47` warn, and `pnpm lint` runs `--max-warnings=0`. Both predate this
cycle's work; neither is in scope for a rate-limiting PR. The `ai` v4→v7 migration is a real
piece of work and needs the owner's call on target API shape.

## 1. ~~`/api/org/switch` sets the active-org cookie without verifying membership~~ ✅

**Done in PR #55** (`fix: verify org membership in /api/org/switch before setting cookie`,
commit `c31bbcb`, 2026-08-19). Both `GET` and `POST` now call
`getOrgMembership(session.user.id, orgId)` and return 403 when the caller is not a member.

> **Backlog-bookkeeping note (2026-08-27):** this item was fixed on 2026-08-19 but never
> ticked off here, so a later cycle would have re-done work already merged. Same rot pattern
> the btc-llm-sentiment registry notes warn about. Before starting any item, `grep` the code
> for the described symptom and check `git log -S` on the named file first.

## 6. `/api/cron/webhook-retry` never scheduled the next attempt on a failed retry ✅

**File:** [`src/app/api/cron/webhook-retry/route.ts`](../src/app/api/cron/webhook-retry/route.ts)

**Done this cycle (2026-08-27).** The cron handler updated the `WebhookEvent` to `FAILED` and
incremented `attempts`, but — unlike `dispatcher.ts`'s `deliver()` — never called
`scheduleRetry(event.id)`. `scheduleRetry` is the only thing that (a) computes the next
`nextRetryAt` on the 1m→5m→30m→2h→6h→24h backoff ladder and (b) marks the event permanently
failed (`nextRetryAt: null`, `[WEBHOOK PERMANENT FAILURE]` log) once `attempts >= 6`.

Because `getEventsForRetry()` selects `status: FAILED AND nextRetryAt <= now`, a failed retry
left `nextRetryAt` at its stale past value, so the event was re-tried **every 5 minutes
forever** — no backoff, no cutoff — hammering a dead endpoint indefinitely and unbounded-
incrementing `attempts`. The first failure (via `deliver()`) was scheduled correctly; every
subsequent one via the cron was not.

**Fix:** call `await scheduleRetry(event.id)` after both `FAILED` updates in the cron loop,
mirroring `deliver()`. Added `src/app/api/cron/webhook-retry/route.test.ts` (5 tests) — the two
failure-path tests fail against the pre-fix handler (verified by `git stash`).

## 7. ~~No rate limiting anywhere in the app~~ ✅ (`/api/chat` only — see scope note)

**Done this cycle (2026-09-04)**, scoped to `/api/chat` exactly as the original item
recommended. `RATE_LIMITED` / HTTP 429 was a defined-but-never-thrown enum member; it is now
thrown for real.

**What shipped:**

- **`RateLimitWindow` model** (`rate_limit_windows`) in `prisma/schema.prisma` — one row per
  (org, bucket, window), soft reference on `organizationId` per design principle 3. The
  `@@unique([organizationId, bucket, windowStart])` index is load-bearing: it is the
  `ON CONFLICT` target.
- **`src/lib/rate-limit.ts`** — fixed-window limiter keyed by **organization id** (the billing
  entity, and the thing whose budget is at risk). Default **20 requests / 60s / org**, as the
  named constant `CHAT_REQUESTS_PER_WINDOW`. The limit is **inclusive**: the 20th request in a
  window passes, the 21st throws `AppError("RATE_LIMITED", …)`.
- **Atomic increment.** The counter is bumped in a *single* statement —
  `INSERT … ON CONFLICT (organization_id, bucket, window_start) DO UPDATE SET request_count =
  rate_limit_windows.request_count + 1 RETURNING request_count`. A read-then-write limiter
  would let N concurrent requests all read the same value and all conclude they were under the
  limit, i.e. it would fail at the exact burst this item exists to stop. Prisma's `upsert()`
  was not used: it cannot express a read-free `count + 1` update and does not guarantee a
  single ON CONFLICT statement for a compound unique target.
- **Wired into `src/app/api/chat/route.ts`** as step 0, before body parsing and before
  `checkBudget()` — the monthly cap is worthless if a client can exhaust it in a minute.
- **`src/lib/rate-limit.test.ts`** — 20 tests (mocked Prisma): window flooring/rollover,
  under-limit, at-the-boundary, over-limit → 429, window reset, fail-closed on DB error. 14 of
  the 20 fail against a deliberately-written read-then-write variant, including the
  "exactly ONE database statement per request" guard — verified by temporarily swapping the
  racy implementation in, not by inspection.

**Deliberately NOT covered — still open, still ranked.** The original item named four
unprotected surfaces; only the first is now protected:

- **`/api/org/switch`** — no throttle on org enumeration.
- **Auth callbacks** — no throttle on credential-stuffing / abuse.
- **API-key creation** — no throttle.

These need an IP-or-user key rather than an org key (the caller may have no active org yet),
which is a genuinely different keying decision, so they were left for a future cycle rather
than guessed at. `enforceRateLimit()` already takes an arbitrary `bucket`, so adding them is a
call site plus a constant — no schema change.

**Also not done:** (a) no pruning job for elapsed `rate_limit_windows` rows — one row per org
per minute accumulates; the `@@index([windowStart])` is in place so a cleanup cron is cheap to
add, but nothing wires one up yet. (b) No RLS policy for the new table, unlike every other
tenant-scoped table in `supabase/migrations/0002_rls_policies.sql`. The limiter only ever runs
through the server-side Prisma client, which bypasses RLS, and the rows hold nothing but an org
id and a count — but this is an intentional inconsistency the owner should sign off on rather
than an oversight.

**Migration caveat:** this repo has no `prisma/migrations/` directory — `scripts/setup.sh` and
`docs/CONTRIBUTING.md` both apply the schema with `pnpm db:push`, and the hand-written SQL in
`supabase/migrations/` covers extensions/RLS only. Running `pnpm db:migrate` would therefore
have generated a whole-schema baseline rather than a one-table migration, so only the schema
model was added. `pnpm db:push` (or a hand-written migration, if the owner would rather start a
Prisma migration history) is needed against a real database before this deploys.

## 8. ~~`webhook-retry` cron delivers sequentially with a 10s timeout per event~~ ✅

**File:** [`src/app/api/cron/webhook-retry/route.ts`](../src/app/api/cron/webhook-retry/route.ts)

**Done (2026-09-18).** Added a local `mapWithConcurrency` helper (no new dependency) and run
retries with at most 10 in flight at once — mirrors `dispatcher.ts`'s `Promise.allSettled`
fan-out but bounded rather than fully unbounded, since this cron loop can span many distinct
orgs/endpoints in one run. The `retried`/`succeeded` counters and all per-event side effects
(status update, `scheduleRetry`) are unchanged.

Added a test that tracks max-in-flight `fetch` calls and confirmed it **fails** against the
pre-fix sequential code (stuck at 1) before passing after the fix — the regression this item
describes is now pinned, not just fixed.

## 2. ~~GDPR erasure (`deleteUserData`) is eight sequential writes with no transaction~~ ✅

**Decision #5: Z.ai takes it.** Wrapped steps 1–7 in a single
`prisma.$transaction(async (tx) => { ... })` — the database now either
sees the fully-erased state or the original state, never the
half-erased, unreconcilable state. Each `prisma.*` call inside the
transaction uses the `tx` client instead of the top-level `prisma`
client. Step 8 (Supabase Auth deletion) stays outside the transaction
(external call, can't join a Postgres transaction); its `throw error`
behavior is preserved so a failure there surfaces to the caller.

Same shape as #55 (org-switch IDOR fix): the fix is small, focused,
and verifiable by inspection — the transaction wrapper is the only
structural change.

## 3. ~~GDPR and audit-log code have zero test coverage~~ ✅

Added tests for `audit()` (7 tests in `src/lib/audit/logger.test.ts`)
and `deleteUserData()` (8 tests in `src/lib/gdpr/deletion.test.ts`).

**audit() tests:** verifies all fields are populated, ipAddress/userAgent
auto-populated from headers, provided values override headers, null
defaults, and the critical "never throws" contract (swallows DB errors
and logs to console).

**deleteUserData() tests:** verifies the `prisma.$transaction` wrapper
from item 2 — confirms steps 1-7 run inside the transaction (conversation
delete, TokenUsage anonymize, DataRequest create, User anonymize, audit
log), step 8 (Supabase Auth deletion) runs after, and Auth failures
throw to the caller.

`exportUserData` tests deferred — it needs a Supabase Storage mock which
is more involved. The deletion + audit coverage is the higher-value
slice (audit never-throws contract + transaction atomicity).

## 4. ~~Webhook permanent-failure has no operator-visible signal~~ ✅

Added a "Permanently Failed Deliveries" section to the
`dashboard/settings/webhooks` page. When webhook events exceed
`MAX_ATTEMPTS` (6 retries over ~33 hours), they're now surfaced in a
destructive-styled card at the top of the page — showing event type,
endpoint URL, attempt count, and when the failure happened.

The Prisma query includes failed deliveries (`status: "FAILED"`) in the
existing `webhookEndpoint.findMany` call, so no extra DB round-trip is
needed. The card only renders when `totalFailed > 0` — zero failures
means zero visual noise.

Notification delivery (email/Slack) deferred as a separate piece per
the backlog note.

## 5. ~~`pnpm test:e2e` has nothing to run~~ ✅

Added a minimal Playwright config + smoke spec so the advertised
"E2E: Playwright" capability is real.

- **`playwright.config.ts`**: standard config with chromium project,
  `webServer` that runs `pnpm dev` and waits for `:3000`. Reuses
  existing dev server in local runs; starts a fresh one in CI.
- **`tests/e2e/smoke.spec.ts`**: two tests — (1) landing page loads and
  shows a title without an error state, (2) login page is reachable
  and renders the email input.
- `@playwright/test` was already in devDependencies — no package.json
  change needed.

## 6. ~~`src/lib/billing/metering.ts` has zero test coverage~~ ✅   `source: coverage`

**Done (2026-10-02).** Added `src/lib/billing/metering.test.ts` (11 tests, mocked
`@/lib/prisma` and `@/lib/ai/cost`, real `PLANS` table): `rollupCurrentPeriod`'s
upsert shape and idempotency, `hasExceededQuota`'s under/at-boundary/over/unlimited
cases, and `getQuotaPercentage`'s rounding, 100% cap, and unlimited-plan case.

Also fixed the `tokenQuota === 0` latent bug this item flagged:
`getQuotaPercentage` now returns a clean `0`/`100` instead of `NaN`/`Infinity` from
dividing by zero. No seeded plan has `tokenQuota: 0` today, so this was unreachable
in production, but the regression test (mocking `@/lib/billing/plans` to add a
zero-quota plan via `vi.doMock`/`vi.resetModules`) was verified to fail against the
pre-fix code (`expected NaN to be +0`) before the fix and pass after.

**Original filing, for history:**

Filed by the repo-backlog-refresh loop, 2026-08-29. `src/lib/billing/`
has one test file (`webhooks.test.ts`); `metering.ts` has none. It holds
three functions on the billing hot path:

- **`hasExceededQuota(orgId, planSlug)`** — called by the chat route to
  gate every AI request against the plan's monthly token quota. A wrong
  boolean here either lets free-tier users run unbounded inference or
  locks paying customers out mid-conversation. It reads
  `getCurrentPeriodUsage()` (which *is* tested, in `ai/cost.test.ts`) and
  compares against `PLANS[planSlug].tokenQuota`, with `-1` meaning
  unlimited.
- **`rollupCurrentPeriod(orgId)`** — the nightly `usageRecord.upsert`
  that every usage report and overage charge is derived from. The
  "idempotent via unique constraint" claim in its docstring is untested.
- **`getQuotaPercentage(orgId, planSlug)`** — only `tokenQuota === -1` is
  special-cased. A plan row with `tokenQuota === 0` yields
  `Math.round(n / 0)` → `Infinity`/`NaN` rather than a clean 0-or-100.
  All seeded plans currently have positive or `-1` quotas, so this is
  latent, but a test would pin the contract.

Add a test file with a mocked `getCurrentPeriodUsage` and the real
`PLANS` table: quota-not-exceeded, quota-exactly-met (`>=` boundary),
unlimited plan, and the `getQuotaPercentage` zero-quota edge. Pure logic,
no DB — same shape as `ai/cost.test.ts`.

## 7. ~~`src/lib/webhooks/dispatcher.ts` has zero test coverage~~ ✅   `source: coverage`

- [x] Covered by `src/lib/webhooks/dispatcher.test.ts` (done 2026-10-14). 9 tests, mocked
  `prisma`/`scheduleRetry`/`fetch`, real `signer.ts`: subscribed-endpoint filter, no-endpoint
  no-op, signed request shape (signature verified against the sent body with the endpoint's
  secret), 2xx → `DELIVERED` with no retry, non-2xx and thrown/timeout → `FAILED` +
  `attempts` increment written *before* `scheduleRetry()` runs, multi-endpoint fan-out where
  one failure doesn't affect the others, and the fire-and-forget contract when the event row
  can't be created. No bug found; checked by removing `scheduleRetry` from the non-2xx branch
  and the `isActive` filter (both caught).

**Original filing, for history:**


`signer.ts` and `retry.ts` both have test files; `dispatcher.ts` — the
seam that ties them together — has none. `dispatchWebhookEvent()` does
the endpoint lookup (`isActive`, `events: { has: eventType }` filter),
and `deliver()` creates the `WebhookEvent` row, signs the body, POSTs
with a 10s `AbortSignal.timeout`, and drives the status transitions
(`PENDING` → `DELIVERED` / `FAILED` + `attempts` increment +
`scheduleRetry`). None of that branching is exercised.

Worth covering because it is the untested half of the webhook-reliability
work that items 4 and 5 (and open PR #70) invested in: the retry logic is
only correct if `deliver()` records `attempts` and `status` the way
`scheduleRetry()` expects. Test with a mocked `fetch` and `prisma`:
2xx path, non-2xx path, thrown/timeout path, and the "no subscribed
endpoints → no-op" early return.

## 8. ~~`src/lib/ai/rag.ts` has zero coverage — `chunkDocument` can infinite-loop~~ ✅   `source: coverage`

`rag.ts` (RAG retrieval + context formatting + document chunking) had no
test file. Beyond the missing coverage there was a concrete defect:

`chunkDocument(text, chunkSize = 2000, overlap = 200)` advances the
cursor with `i += chunkSize - overlap` and had no guard that
`overlap < chunkSize` (`rag.ts:82-90`). Any caller passing
`overlap >= chunkSize` — or swapping the two positional args — made the
step `<= 0`, so the `while (i < text.length)` loop never terminated and
`chunks` grew without bound until the process was killed. The defaults
were safe, so this was dormant (confirmed: `chunkDocument` has no call
sites anywhere in `src/` yet, only the RAG pipeline this feeds isn't
wired up), but it was an un-validated public function feeding the future
ingestion pipeline.

**Fixed:** validates now — throws `RangeError` for `chunkSize <= 0`,
`overlap < 0`, or `overlap >= chunkSize`, rather than looping forever.
Chose "throw" over "clamp" (the doc's other suggested option) because a
caller passing nonsensical args to a chunking function has a bug worth
surfacing, not silently working around. Confirmed the infinite loop was
real before fixing it (isolated repro, killed at 1000+ iterations with
`i` stuck at 0), not just a theoretical read of the arithmetic.

Added `src/lib/ai/rag.test.ts` (12 tests, pure functions, no DB): the four
new guard-throws (including the exact swapped-positional-args case named
above), short-text-single-chunk, empty-text, whole-document
reconstruction from overlapping chunks, actual overlap-content
correctness, zero-overlap, and `formatContextForPrompt` with zero and N
chunks.

Loop-Agent: backlog-refresh / claude / laptop

## 9. `getOrgMembership()` has zero test coverage — it's the org-authorization primitive behind an already-fixed IDOR   `source: coverage`

`src/lib/auth/org-context.ts` (lines 36-48) has no test file at all (only `permissions.test.ts` exists in `src/lib/auth/`). It is the single membership lookup behind both `requireUserWithPermission()` (`src/lib/auth/session.ts:81-82`, used app-wide) and `/api/org/switch` (`src/app/api/org/switch/route.ts:24,45`), and its `if (!membership || membership.status !== "ACTIVE") return null` line is what makes a suspended or removed member correctly fail authorization. This is an auth-decision path whose caller already shipped an IDOR (closed item 1, "sets the active-org cookie without verifying membership") — a dropped `ACTIVE` filter here would reopen that exact bug class with no failing test to catch it.

Loop-Agent: backlog-refresh / claude / laptop

## 10. `exportUserData()` (GDPR data export) has zero test coverage   `source: coverage`

`src/lib/gdpr/export.ts` (lines 13-119): eight parallel Prisma reads, a ZIP build, a Supabase Storage upload, a 7-day signed URL, a `DataRequest` row and an audit-log write, with neither error branch (`uploadError`, `urlError`) nor the `hashedKey: "[REDACTED]"` redaction on line 33 exercised. Item 3 (closed) deferred these tests as "needs a Supabase Storage mock which is more involved" and nothing was added since, with no open item tracking it. Every read here is keyed by `userId` (no cross-user exposure), and both error branches `throw` rather than swallow, so a bug's cost is a failed download, not wrong data going to the wrong person — plain coverage gap, not a risky-path one. A `vi.mock` of `@/lib/supabase/admin` returning stubbed `upload`/`createSignedUrl` results would cover the happy path, both error branches, and the redaction assertion.

Loop-Agent: backlog-refresh / claude / laptop

## 11. `scheduleRetry()`/`getEventsForRetry()` (webhook retry backoff) have zero direct test coverage   `source: coverage`

`src/lib/webhooks/retry.ts` (lines 27-81): `src/app/api/cron/webhook-retry/route.test.ts` replaces `scheduleRetry` with `vi.mock`, so the `RETRY_INTERVALS_MS` backoff ladder, the ±20% jitter, and the `attempts >= MAX_ATTEMPTS` permanent-failure branch never actually execute. The mechanism's *absence* was already the bug in closed item 6 (the cron never called `scheduleRetry`); the logic inside it has still never been verified independently. It's pure arithmetic over a single `prisma.webhookEvent` read/update (retry bookkeeping, not business data — a bad backoff produces wrong timing or an early give-up, both recoverable and already logged), so a mocked-Prisma test covering attempts 0, mid-ladder, and at-max is cheap.

Loop-Agent: backlog-refresh / claude / laptop

## 12. CSP still uses `'unsafe-inline'` + `'unsafe-eval'`, with a self-documented TODO   `source: docs`

`next.config.ts:50-53` — the Content-Security-Policy header sets `script-src 'self' 'unsafe-inline' 'unsafe-eval'` with an explicit `// TODO: for production, replace 'unsafe-inline' with nonce-based CSP via next.config.ts experimental: { nonce: true } + middleware.` This is the only TODO/FIXME/XXX/HACK marker in the entire `.ts`/`.tsx` tree. Not filed anywhere in the backlog. Flagging as owner-judgment-needed since tightening CSP could affect any inline scripts downstream builders add to this boilerplate — not a drop-in fix.

## 13. No coverage tooling installed — `vitest run --coverage` fails outright   `source: coverage`

`npx vitest run --coverage` errors with `MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'`; `package.json` has no `test:coverage` script and neither `@vitest/coverage-v8` nor `@vitest/coverage-istanbul` is a devDependency. Every coverage item in this backlog (including items 6/7 and 9-11 above) had to be found by manually diffing `src/**/*.ts` against `src/**/*.test.ts` rather than real line/branch percentages. Lowest priority of this batch — a tooling gap, not a code risk.

Loop-Agent: backlog-refresh / claude / laptop

## 14. `deliver()`'s `try` also wraps its own bookkeeping, so a DB error is treated as a delivery failure   `source: code`

`src/lib/webhooks/dispatcher.ts`, `deliver()`: the `try` block covers not just `fetch()` but
also the `webhookEvent.update(...)` calls and `scheduleRetry()` that follow it. Two
consequences, found while writing item 7's tests:

- After a **2xx**, if the `DELIVERED` update throws (DB blip), the `catch` marks the event
  `FAILED` and schedules a retry, so the receiver gets the same event **again** later.
- After a **non-2xx**, if `scheduleRetry()` throws, the `catch` runs a second
  `attempts: { increment: 1 }`, so one failed attempt is counted twice and the event reaches
  `MAX_ATTEMPTS` early on the backoff ladder.

Fix: narrow the `try` to the `fetch()` call and handle the response outside it, and decide
what a failed bookkeeping write should do (log and leave the row for the cron, most likely).
Check: in `dispatcher.test.ts`, make `updateMock` reject once after a 2xx and assert no
`FAILED` update and no `scheduleRetry`; make `scheduleRetryMock` reject once after a 503 and
assert exactly one `attempts` increment. Both fail on the current code.

---

**Notes for future cycles:** nothing here needed the owner's judgement to identify, but item 2
(and the transaction wrapping in item 3) is a database-write-path change — per this loop's own
rules, escalate that piece to the higher-reasoning model rather than implementing it directly on
the cheap tier.

Item 6 (2026-08-27) also touches a DB write path (`WebhookEvent` updates) but the fix is a
one-line mirror of the already-correct `deliver()` path and is pinned by unit tests, so it was
done on the cheap tier and its PR left open for human review rather than auto-merged.
