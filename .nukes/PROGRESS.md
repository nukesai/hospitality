# Progress Log

> In-repo mirror of session progress. Detail lives in git history and the
> decision records (`RESEARCH.md`, `RESEARCH-BACKEND.md`); rules in `AGENTS.md`.

## Session 1 — Foundation (2026-08-20) ✅

Repo rebuilt as a production package factory: pnpm catalog, turbo graph,
TS 7 (TS6 alias for typescript-eslint), tsdown ESM/unbundle builds with
publint+attw, ESLint 10 flat + SSR/CSR boundary zones, vitest 100% gate +
failure canary, playwright E2E, size-limit budgets, husky/commitlint,
changesets fixed group, proprietary licensing, CLI (init/add/doctor/upgrade),
CLAUDE.md/AGENTS.md. 23 adversarial-review findings fixed.
Commits: `017cb2a…b332b54`.

## Session 2 — Backend system (2026-08-20 → 21) ✅

- **DB**: Drizzle 0.45 + PG 18, RLS branch isolation (pos_owner/pos_app,
  branchGuard InitPlan policies, role-gated DELETE), shipped migrations +
  advisory-locked runner, pool singleton + R2 boot guard. Live-verified.
- **Auth**: better-auth 1.7, organization ≡ branch, AC derived from common's
  permission matrix, bearer (mobile), Mailpit email verification.
- **API**: tRPC v11 + zod 4 + OpenAPI 3.1 (zod-openapi pinned 5.4.6) + Scalar
  at /api/docs; consumer-owned `t`; guards 401/403/422/429 verified over HTTP.
- **Cache**: Redis tag invalidation (branch-scoped), single-flight + SWR,
  enforced `meta.cacheInvalidates` discipline; invalidation fails closed.
- **Observability**: pino + AppError registry + request correlation; zero console.
- **i18n**: catalogs single-sourced in common (single-brace), frontend derives
  i18next resources; en/ne E2E-verified server+client.
- **DX**: Docker stack (PG/Redis/Mailpit), `.env`-driven `createNukesPos`,
  `pnpm dev:full`, integration suite, CI runs the stack in the e2e job.
- **Proof**: 62 unit files at 100/100/100/100 · 13 E2E · 6 live RLS tests ·
  16-agent adversarial review, 13 findings fixed.
  Commits: `bba6024…9e36825`.

## Next

Feature phases on the finished rails (see AGENTS.md + memory): orders
lifecycle, tables/QR, reservations, payments; admin panel UI; CLI templates
for the consumer scaffold. Open risks: PgBouncer fixture, auth-schema drift
CI check, npm org purchase + first manual publish.
