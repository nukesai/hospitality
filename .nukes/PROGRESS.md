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

## Session 3 — Integration surface + next-intl (2026-08-21) ✅

Consumer boilerplate eliminated; packages own the integration:

- **Single mount**: `createPosApi(pos, appRouter)` serves auth/trpc/rest/
  openapi.json/docs from ONE `app/api/pos/[[...pos]]/route.ts`; layout from
  `posApiPaths(POS_API_BASE_PATH)` in common (server+clients share it);
  better-auth mounted via basePath. Five route files -> one.
- **Package-owned tRPC — ALL of it** (R1 resolved): root + procedures +
  middlewares + BUILT routers (healthRouter/ordersRouter/posCoreRouter) ship
  annotated (cast-free, checked). Unblocked by the schema fix: z.ZodType MUST
  carry BOTH generics — z.ZodType<T> leaves Input=unknown and had silently
  widened every client input since session 2 (type contract now guards it).
  Consumers have NO server dir: route.ts consumes posCoreRouter, features
  arrive by version bump; `nukes-pos add` scaffolds the optional marker-managed
  extension file for app-local procedures. `getPos()`/`disposePos()` singleton
  replaces lib/pos.server.ts (the one sanctioned ambient env read; auto
  @vercel/functions).
- **i18n -> next-intl 4.13.7** (i18next removed): flat common SSOT nested at
  the frontend boundary under `pos`; `createPosRequestConfig` cascade
  (explicit > resolveLocale > [locale] segment > cookie > default); `PosIntl`
  one-tag layout provider (client provider hard-requires locale — verified in
  dist — the leaf reads the ancestor); `withNukesPos` next.config wrapper;
  `createPosProxy` for Next 16 proxy.ts; `PosAdminShell` admin route.
- **CLI = the assembler**: init/add/doctor/upgrade fully implemented; stamped
  files, manifest ledger, marker-spliced routers, deps injection, magicast
  next.config patch; templates GENERATED from apps/example (zero drift by
  construction). Cookie-mode default (non-invasive), `--i18n-routing` opt-in.
- **Proof**: 572 unit tests 100/100/100/100 · 42 e2e (incl. admin shell) on
  the live stack · every gate green. Live-verified: /, /ne, /admin,
  /ne/admin/orders, full auth signup->Mailpit + all API surfaces.

## Next

Feature phases on the finished rails: orders lifecycle UI in PosAdminShell,
tables/QR, reservations, payments (each: schema+RLS, service, feature router
template in the CLI registry). Open risks: PgBouncer fixture, auth-schema
drift CI check, npm org purchase + first manual publish; root-params static
rendering once next-intl's requestLocale successor settles.
