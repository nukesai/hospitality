# RESEARCH-BACKEND.md — Backend System Decision Record

Status: **APPROVED FOR IMPLEMENTATION** · Date: 2026-08-20 · Author: principal architect,
consolidating 8 researcher reports + adversarial verdicts. Where a verdict said
PARTIAL/REFUTED, the correction is baked in below. Everything marked **UNVERIFIED** must be
proven with a scratch fixture before the code that depends on it lands.

---

## 0. Contradiction resolutions (binding)

| #   | Conflict                                                                                                                                                                                                                                            | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | "backend must set `isolatedDeclarations: false` for tRPC routers" (trpc-openapi researcher) vs "built routers cannot live in the package; export annotated builders, assemble routers in the consumer" (cache researcher, compile-proven both ways) | **isolatedDeclarations stays ON in backend.** Backend ships: context/deps types, middleware **factories** (annotated `TRPCMiddlewareBuilder<...>` — verified compilable), procedure **service functions** + zod schemas (all business logic, 100%-covered in-package), error formatter, and **router-parameterized** handler factories. Routers themselves (`t.router({...})`, `AppRouter`) are assembled in the consumer scaffold (apps/example + CLI templates) under the app tsconfig, exactly as the cache researcher proved. No gate exception, no tsdown/oxc dts unknowns. |
| R2  | "every branch table MUST use FORCE ROW LEVEL SECURITY" (docker researcher) vs "do NOT set FORCE; owner exemption is the migration/seed bypass channel" (rls researcher, live-verified)                                                              | **No FORCE.** Migrations + seeds run as `pos_owner` (table owner ⇒ RLS-exempt, verified). Runtime connects only as `pos_app` (`NOSUPERUSER NOBYPASSRLS`, non-owner). Guards: boot-time assertion refusing to serve if `current_user` is superuser/BYPASSRLS/owner in production, plus explicit `where branchId = ctx.branchId` in every repository query (belt and suspenders — verdict-confirmed the app filter also restores index choice under any policy shape).                                                                                                             |
| R3  | Roles created in migration `0000` (drizzle researcher) vs in `docker/initdb/01-roles.sql` (rls/docker researchers)                                                                                                                                  | **Both, idempotently.** `docker/initdb/01-roles.sql` (and the same script run once via psql on managed PG) creates LOGIN roles `pos_owner`/`pos_app` + grants + `ALTER DEFAULT PRIVILEGES`. Shipped migration `0000_bootstrap-roles.sql` defensively `DO $$ IF NOT EXISTS ... CREATE ROLE pos_app NOLOGIN` + grants, so `CREATE POLICY` never 42704s on a consumer DB where initdb never ran (live-verified failure mode). Schema code declares `pgRole("pos_app").existing()` so drizzle-kit never manages roles.                                                               |
| R4  | One GUC (`app.branch_id`) vs three (`app.user_id`, `app.branch_id`, `app.role`)                                                                                                                                                                     | **Three GUCs**, set in one parameterized `select set_config(...)` with `is_local=true` inside `db.transaction` (verified ≡ SET LOCAL, reverts on COMMIT and ROLLBACK). Role-gated policies (e.g. DELETE) read `app.role`.                                                                                                                                                                                                                                                                                                                                                        |
| R5  | `current_setting(name, true)` returns NULL when unset (rls fixture) vs `''` after a reverted local set on the same pooled connection (drizzle fixture, 22P02 crash reproduced)                                                                      | **Both observations are true** (never-set ⇒ NULL; post-tx residue ⇒ `''`). Every policy predicate uses the single `branchGuard()` fragment: `col = (select nullif(current_setting('app.branch_id', true), '')::uuid)` — fail-closed for both cases, InitPlan-hoisted (verdict: the `(select ...)` wrap is a ~3x optimization; the real cliff is subqueries in USING, which are banned).                                                                                                                                                                                          |
| R6  | Schema at `src/db/schema/**` vs `src/adapters/drizzle/schema/**`                                                                                                                                                                                    | **`src/adapters/drizzle/schema/**`** — AGENTS.md is normative ("drivers live in src/adapters/<name>/ and surface as new export subpaths").                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R7  | Branch id from `x-branch-id` header validated against `session.branchIds` vs better-auth `session.activeOrganizationId` + `getActiveMember`                                                                                                         | **Canonical = `session.activeOrganizationId`** (server truth, set via `setActiveOrganization`). An `x-branch-id` header is accepted only when it equals the active branch; otherwise 403 `BRANCH_ACCESS_DENIED` with a "switch branch" message. Mobile bearer clients call `setActiveOrganization` after sign-in. (Cross-branch header override via `hasPermission({organizationId})` is a documented later enhancement.)                                                                                                                                                        |
| R8  | Permission matrix hand-written in backend (rbac researcher) vs pure matrix in common + derivation in backend (rls researcher)                                                                                                                       | **Matrix lives in `@nukesai-pos/common`** (pure, zero-I/O, isomorphic: drives tRPC guards, RLS `app.role` gates, UI gating). Backend derives better-auth AC (`createAccessControl` + `defaultStatements`/`ownerAc`/`adminAc` merge); frontend re-derives client-side with the same ~20-line pure function (frontend may not import backend). A table-driven vitest in each package locks the derivation.                                                                                                                                                                         |
| R9  | nodemailer pooled (`pool:true`, maxConnections 5) vs non-pooled                                                                                                                                                                                     | **Non-pooled** (simplest correct lifecycle; mailpit/provider SMTP fine at POS volumes). `close()` stays on the port; switch to pooled later only with a measured need.                                                                                                                                                                                                                                                                                                                                                                                                           |
| R10 | `serverExternalPackages: ["pg", "pino"]` required in apps/example (docker researcher)                                                                                                                                                               | **REFUTED by verdict**: Next 16.3.1 ships pg/pino in its built-in externals default list, and apps/example already externalizes `@nukesai-pos/backend`. **No change to next.config.ts** beyond what exists. Caveat kept: never list a package in both `transpilePackages` and `serverExternalPackages` (build error E173).                                                                                                                                                                                                                                                       |
| R11 | "per-request SET application_name leaks under PgBouncer transaction mode"                                                                                                                                                                           | **REFUTED by verdict** (application_name is a PgBouncer-tracked parameter). Pool-level `application_name` is still the pick — the correct rationale is per-checkout round-trip cost, not leakage. requestId travels in structured log fields only.                                                                                                                                                                                                                                                                                                                               |
| R12 | common is dependency-free vs common needs zod for the analytics event catalog                                                                                                                                                                       | **common gains its first runtime dep: `zod` 4.4.3** (isomorphic ESM; the locked validation stack). Size-limit budgets for common must be updated in the same commit (dedicated reviewed budget change per AGENTS.md). Existing hand-rolled validators stay; zod is used only by `observability/analytics.ts`.                                                                                                                                                                                                                                                                    |
| R13 | Rate limiting in better-auth config vs tRPC middleware                                                                                                                                                                                              | **Both, different scopes**: better-auth built-in limiter guards `/api/auth/*` (storage `secondary-storage` when Redis present, else `database`); the tRPC `rateLimit()` middleware factory (over the cache/kv port) guards API procedures, keyed userId-then-ip, placed AFTER auth.                                                                                                                                                                                                                                                                                              |
| R14 | `SecondaryStorage`/KvPort (auth) vs `CacheStore` (cache layer)                                                                                                                                                                                      | **Two ports, one client.** `ports/cache.ts` (CacheStore/CachePort, tag semantics) and `ports/kv.ts` (KvPort: get/set/delete/getAndDelete/incrementWithTtl — better-auth 1.7's FIVE-method SecondaryStorage, verified). Redis adapters export both stores over the same shared ioredis/upstash client.                                                                                                                                                                                                                                                                            |
| R15 | Postgres 17 (fixtures) vs 18.6-alpine (docker researcher)                                                                                                                                                                                           | **postgres:18.6-alpine**, with the verified 18+ volume-path change: mount at `/var/lib/postgresql` (NOT `/var/lib/postgresql/data`). All RLS behavior was verified on 17; semantics unchanged on 18.                                                                                                                                                                                                                                                                                                                                                                             |
| R16 | Library-owned single tRPC root vs consumer-owned                                                                                                                                                                                                    | Follows R1: **consumer owns the root `t`** (scaffolded one-liner using exported `PosTrpcContext`/`PosTrpcMeta`/`posErrorFormatter` + superjson); backend middleware ships as factories the consumer `.use()`s. If cross-instance procedure composition ever trips types (**UNVERIFIED** edge), the factory pattern is already the fallback — nothing to redesign.                                                                                                                                                                                                                |

---

## 1. Dependency matrix

### 1.1 Catalog additions (`pnpm-workspace.yaml`)

```yaml
# --- backend phase additions ---
"@trpc/server": 11.18.0
"@trpc/client": 11.18.0
"@trpc/tanstack-react-query": 11.18.0
"@tanstack/react-query": 5.90.2 # verify exact latest 5.x (>=5.80.3) at implementation
trpc-to-openapi: 3.3.0
zod: 4.4.3
zod-openapi: 5.4.6 # MUST stay 5.x — 6.x violates trpc-to-openapi peer ^5.4.4 (verified)
superjson: 2.2.6
"@scalar/nextjs-api-reference": 0.11.14
better-auth: 1.7.1
drizzle-orm: 0.45.2
drizzle-kit: 0.31.10
drizzle-zod: 0.8.3
pg: 8.23.0
"@types/pg": 8.15.6 # verify exact latest at implementation
ioredis: 6.0.0
"@upstash/redis": 1.38.2
pino: 10.3.1
nodemailer: 9.0.5
"@types/nodemailer": 8.0.1 # DT lags v9 by a major — adapter surface confined to createTransport/sendMail/close
i18next: 26.4.0
react-i18next: 17.0.12
"@vercel/functions": 3.9.5
```

### 1.2 Placement

| Package                   | dependencies                                                                                                                                                                                                        | peerDependencies                                                                                                                                                                                                                                                                                                        | devDependencies (new)                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **@nukesai-pos/common**   | `zod` (catalog — first runtime dep, R12)                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                                                       | —                                                                            |
| **@nukesai-pos/backend**  | `@nukesai-pos/common`, `server-only`, `@trpc/server`, `trpc-to-openapi`, `zod`, `zod-openapi`, `superjson`, `@scalar/nextjs-api-reference`, `better-auth`, `drizzle-orm`, `drizzle-zod`, `pg`, `pino`, `nodemailer` | `next ^16.3.0` (existing); `ioredis ^6.0.0` + `@upstash/redis ^1.38.2` **optional** (`peerDependenciesMeta.optional: true`, loaded via dynamic import)                                                                                                                                                                  | `drizzle-kit`, `@types/pg`, `@types/nodemailer`, `ioredis`, `@upstash/redis` |
| **@nukesai-pos/frontend** | `@nukesai-pos/common`                                                                                                                                                                                               | existing `next`/`react`/`react-dom` **plus** `i18next ^26.2.0`, `react-i18next ^17.0.0`, `@trpc/client ^11.18.0`, `@trpc/tanstack-react-query ^11.18.0`, `@tanstack/react-query ^5.80.3`, `better-auth ^1.7.1` (all context/instance-identity-bound — peer placement is mandatory, verdict-confirmed for react-i18next) | catalog mirrors of every new peer                                            |
| **apps/example**          | `@vercel/functions`, plus concrete installs of every frontend peer (`i18next`, `react-i18next`, `@trpc/client`, `@trpc/tanstack-react-query`, `@tanstack/react-query`, `better-auth`, `superjson`)                  | —                                                                                                                                                                                                                                                                                                                       | —                                                                            |
| **@nukesai-pos/cli**      | no runtime workspace deps (rule) — templates reference the packages                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                       | —                                                                            |

All entries `catalog:` in package.json (syncpack policy). `zod-openapi` is pinned exact in the
catalog; syncpack enforces it repo-wide.

---

## 2. Final directory layout

```
packages/backend/
  drizzle.config.ts                     # dev-only (drizzle-kit); no env needed for generate (verified)
  migrations/                           # SHIPPED (files allowlist): NNNN_*.sql + meta/{_journal.json,*_snapshot.json} — committed
    0000_bootstrap-roles.sql            # custom migration: idempotent pos_app role + grants (R3)
  scripts/                              # dev-only, NOT shipped in dist; plain `node` (Node 24 stable type stripping)
    db-migrate.ts
    db-seed.ts
  src/
    env.ts                              # zod-4 env schema + parseEnv(source). NO server-only import (verified: breaks plain-Node scripts)
    bootstrap/create-pos.ts             # createNukesPos() composition root
    ports/
      cache.ts                          # CachePort/CacheStore/metrics + buildCacheKey/buildCacheTag/hashDiscriminator
      kv.ts                             # KvPort (better-auth SecondaryStorage shape, 5 methods)
      mail.ts                           # MailPort { send, close }
      order-repository.ts               # existing
    cache/
      create-cache.ts                   # single-flight + SWR + fail-open/fail-closed decorator (runtime-verified)
      from-env.ts                       # driver selection, dynamic imports for optional peers
      invalidation.ts                   # PosTrpcMeta.cacheInvalidates + cacheEffects middleware factory
    auth/
      roles.ts                          # derive better-auth AC from common PERMISSION_MATRIX (R8)
      index.ts                          # createAuth(deps): betterAuth factory, org-as-branch remap, bearer, nextCookies
    trpc/
      init.ts                           # PosTrpcContext/PosTrpcDeps types, createTRPCContext, posErrorFormatter
      middleware.ts                     # factories: authGuard, branchGuard, roleGuard, rateLimit, cacheEffects, validation422
      services/                         # business logic as plain functions + zod schemas (routers bind them in the app, R1)
        health.ts orders.ts ...
    i18n/resolve-locale.ts              # Accept-Language matcher + createRequestTranslator over common translator
    internal/
      global-error-handlers.ts          # uncaught/unhandled registration with disposer
      trpc/error-mapping.ts             # appErrorToTRPCError, toSafeErrorData (zod → 422 shape)
    next/
      handlers.ts                       # router-parameterized factories: createTrpcHandlers/createOpenApiHandlers/
                                        #   createOpenApiJsonHandler/createDocsHandler (+ origin/body guards)
      auth-handlers.ts                  # createAuthRouteHandlers(auth) → toNextJsHandler
    adapters/
      drizzle/
        client.ts                       # pg.Pool singleton (globalThis Symbol.for), injected config, error listener, close()
        rls.ts                          # withBranchContext(db, ctx, fn) — the ONLY sanctioned context entry point
        migrate.ts                      # runPosMigrations(): shipped SQL + advisory lock + public-schema bookkeeping table
        schema/
          _column-types.ts              # PgColumn alias helpers for isolatedDeclarations (compile-verified)
          _policies.ts                  # branchGuard()/roleGuard() shared sql fragments (R5)
          auth.ts                       # committed output of `npx auth@1.7.1 generate` (branch remap) — drizzle-kit owns SQL
          branches.ts orders.ts ...     # domain tables, RLS policies, branch-leading indexes
          index.ts                      # re-export barrel only
      cache/
        redis.ts                        # ioredis CacheStore + KvPort over one shared lazy client
        upstash.ts                      # @upstash/redis CacheStore + KvPort (automaticDeserialization:false)
        memory.ts                       # bounded LRU + tag index (tests/dev)
      auth/secondary-storage.ts         # KvPort → better-auth SecondaryStorage
      mail/
        nodemailer.ts                   # non-pooled SMTP adapter (R9)
        noop.ts
      logging/pino.ts                   # LoggerPort adapter; sync stdout on vercel runtime; NO pino.transport
      demo/                             # existing

packages/common/src/
  auth/permissions.ts                   # POS_ROLES/POS_RESOURCES/POS_ACTIONS/PERMISSION_MATRIX + can()  (new ./auth subpath)
  observability/{logger.ts,analytics.ts,index.ts}   # LoggerPort/AnalyticsPort + noop + event catalog (new ./observability subpath)
  errors/{codes.ts,app-error.ts,index.ts}           # ERROR_CODES registry + AppError (new ./errors subpath)
  i18n/ constants/ money/ runtime/ schemas/ types/  # existing

packages/frontend/src/
  i18n/index.ts                         # createPosI18n + mergePosResources (NEW neutral ./i18n subpath — no directive)
  locales/en.ts locales/ne.ts           # per-locale subpaths ./locales/* (tree-shakable)
  server/i18n.ts                        # createPosServerI18n (React cache() per-request instances) — rides ./server
  client/i18n.tsx                       # "use client" leaf: PosI18nProvider + useTranslation re-export — rides ./client
  client/trpc-provider.tsx              # "use client": QueryClient SSR-safe singleton + TRPCProvider (@trpc/tanstack-react-query)
  client/auth/{roles.ts,auth-client.ts} # client AC derivation from common matrix + createPosAuthClient (bearer-capable)

apps/example/
  lib/pos.server.ts                     # getPos(): globalThis-cached createNukesPos + attachDatabasePool on VERCEL
  server/trpc.ts                        # consumer-owned t = initTRPC.context<PosTrpcContext>().meta<PosTrpcMeta>().create(...)
  server/routers/_app.ts                # appRouter assembly from backend services + middleware factories; exports AppRouter
  app/api/auth/[...all]/route.ts        # export const { GET, POST } = createAuthRouteHandlers(getPos().auth)
  app/api/trpc/[trpc]/route.ts          # createTrpcHandlers({ router: appRouter, ... }); runtime = "nodejs"
  app/api/rest/[...rest]/route.ts       # createOpenApiHandlers(...) under its own prefix (never a bare /api catch-all)
  app/api/openapi.json/route.ts
  app/api/docs/route.ts                 # Scalar
  app/[lng]/...                         # i18n-routed pages
  instrumentation.ts                    # registerGlobalErrorHandlers (single registration point)
  i18next.d.ts                          # consumer-owned CustomTypeOptions augmentation (library must NOT ship it)

docker/
  compose.yaml                          # postgres:18.6-alpine + redis:8.10-alpine + axllent/mailpit:v1.30
  initdb/01-roles.sql                   # pos_owner/pos_app LOGIN roles, grants, default privileges, nukes_pos + nukes_pos_test

.env.example                            # root single source of truth; symlink → apps/example/.env.local
```

Root scripts (added, matching existing conventions): `stack:up`, `stack:down`, `stack:nuke`,
`db:generate`, `db:migrate`, `db:seed`, `dev:full`, `test:integration`.
Backend scripts: `db:generate`, `db:custom`, `db:check`, `db:migrate`, `db:seed`.

New backend export subpaths (each with `server-only` pill + `browser` guard condition except
where noted, each with a size-limit budget entry): `./env` (no pill — scripts import it),
`./bootstrap`, `./trpc`, `./next`, `./cache`, `./auth`, `./adapters/drizzle`,
`./adapters/cache-redis`, `./adapters/cache-upstash`, `./adapters/cache-memory` (no browser
guard needed — isomorphic-safe but exported for tests), `./adapters/logging`.

To be explicit, because the wording above was once read both ways: "isomorphic-safe"
excuses `./adapters/cache-memory` from the **browser guard only**. It still carries the
`server-only` pill. Being technically runnable in a browser is not a licence to import it
from one — the package is server-only with no exceptions (`docs/architecture/isolation.md`
§2). The only pill exemptions are the type-only `./ports` and `./env`.

Enforcement is derived, not listed: `packages/backend/test/boundary.dist.test.ts` reads the
`exports` map and asserts both locks per entry. It previously iterated a hard-coded pair and
so covered 2 of 12 entries, which is how six subpaths lost a lock with nothing going red.
New common subpaths: `./auth`, `./observability`, `./errors`.
New frontend subpaths: `./i18n`, `./locales/*`.

---

## 3. Env schema & bootstrap contract

Rule: **the package never reads `process.env`**. The consumer passes a record into
`createNukesPos({ env: process.env })`. `src/env.ts` is the only module that interprets it.
Dev-only `scripts/**` may read `process.env` (dedicated ESLint zone).

| Variable                                              | Type / values                                                        | Default                                                                | Required                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `NODE_ENV`                                            | `development\|test\|production`                                      | `development`                                                          | no                                                 |
| `BACKEND_RUNTIME`                                     | `server\|vercel`                                                     | `server`                                                               | no — drives pino sync, pool preset, exit semantics |
| `DATABASE_URL`                                        | postgres(ql) URL (runtime role `pos_app`; prod: pooled provider URL) | —                                                                      | **yes**                                            |
| `MIGRATE_DATABASE_URL`                                | postgres URL (`pos_owner`, direct — never transaction-pooled)        | falls back to `DATABASE_URL`                                           | no                                                 |
| `DATABASE_POOL_MAX`                                   | int 1..1000                                                          | `10` (Vercel guidance: 5)                                              | no                                                 |
| `DATABASE_POOL_IDLE_TIMEOUT_MS`                       | int                                                                  | `30000`                                                                | no                                                 |
| `DATABASE_CONNECT_TIMEOUT_MS`                         | int                                                                  | `10000`                                                                | no                                                 |
| `DATABASE_POOL_MAX_USES`                              | int (0 = unlimited)                                                  | `7500` on vercel, `0` on server                                        | no                                                 |
| `DATABASE_SSL`                                        | stringbool                                                           | `false`                                                                | no                                                 |
| `CACHE_DRIVER`                                        | `memory\|ioredis\|upstash`                                           | `memory` (refine: production requires non-memory — warning via logger) | no                                                 |
| `CACHE_URL`                                           | rediss? URL                                                          | —                                                                      | when driver=ioredis (zod refine)                   |
| `CACHE_KEY_PREFIX`                                    | string                                                               | `pos`                                                                  | no                                                 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | URL / string                                                         | —                                                                      | when driver=upstash (refine)                       |
| `BETTER_AUTH_SECRET`                                  | string min 32                                                        | —                                                                      | **yes**                                            |
| `BETTER_AUTH_URL`                                     | URL                                                                  | —                                                                      | **yes**                                            |
| `AUTH_TRUSTED_ORIGINS`                                | csv → string[]                                                       | `[]` (BETTER_AUTH_URL origin always included)                          | no                                                 |
| `AUTH_COOKIE_DOMAIN`                                  | string                                                               | —                                                                      | no                                                 |
| `MAIL_DRIVER`                                         | `smtp\|noop`                                                         | `noop`                                                                 | no                                                 |
| `SMTP_HOST`                                           | string                                                               | —                                                                      | when driver=smtp (refine)                          |
| `SMTP_PORT`                                           | int                                                                  | `1025`                                                                 | no                                                 |
| `SMTP_SECURE`                                         | stringbool                                                           | `false`                                                                | no                                                 |
| `SMTP_USER` / `SMTP_PASS`                             | string                                                               | —                                                                      | no                                                 |
| `MAIL_FROM`                                           | email                                                                | `no-reply@localhost`                                                   | no                                                 |
| `LOG_LEVEL`                                           | pino levels + `silent`                                               | `info`                                                                 | no                                                 |
| `ANALYTICS_DRIVER`                                    | `noop\|webhook`                                                      | `noop`                                                                 | no                                                 |
| `ANALYTICS_WRITE_KEY`                                 | string                                                               | —                                                                      | no                                                 |
| `API_MAX_BODY_BYTES`                                  | int                                                                  | `1048576`                                                              | no                                                 |
| `DEFAULT_LOCALE`                                      | string                                                               | `en`                                                                   | no                                                 |

Verified zod-4 APIs used: `z.url({ protocol: /^postgres(ql)?$/ })`, `z.stringbool()`,
`z.coerce.number().int()`, `.refine(fn, { error, path })`, `z.prettifyError(error)`.

### `createNukesPos` contract

```ts
export interface CreateNukesPosOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Vercel Fluid: pass attachDatabasePool from @vercel/functions (verdict-mandated —
   *  SIGTERM hooks do NOT cover instance SUSPENSION). Kept a hook: backend has no Vercel dep. */
  readonly onPoolCreated?: (pool: pg.Pool) => void;
  /** Vercel: waitUntil from @vercel/functions — SWR background refresh scheduler. */
  readonly waitUntil?: (p: Promise<unknown>) => void;
  readonly mail?: MailPort; // test override
  readonly logger?: LoggerPort; // test override; default: pino adapter from env
}

export interface NukesPos {
  readonly env: PosEnv;
  readonly pool: pg.Pool;
  readonly db: PosDatabase; // NodePgDatabase<typeof schema>
  readonly auth: PosAuth; // better-auth instance (nameable type, verified)
  readonly cache: CachePort;
  readonly kv: KvPort;
  readonly mail: MailPort;
  readonly logger: LoggerPort;
  readonly analytics: AnalyticsPort;
  readonly trpc: {
    readonly deps: PosTrpcDeps;
    readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  };
  /** Single leak choke-point: mail.close → cache.close → pool.end. Idempotent. */
  readonly shutdown: () => Promise<void>;
}
```

Lifecycle guarantees (0-leak contract): one Pool per process (globalThis + `Symbol.for` key —
survives Next dev HMR and Fluid reuse); mandatory `pool.on("error")` → logger (idle-client
errors otherwise crash node); Docker path registers a SIGTERM hook calling `shutdown()`;
Vercel path relies on `attachDatabasePool` (suspension) and never `process.exit`s.
`shutdown()` is idempotent (memoized promise) and after resolve `pool.totalCount === 0`.

---

## 4. Database

**Stack**: drizzle-orm 0.45.2 + drizzle-kit 0.31.10, `pg.Pool` (8.23.0) only. Postgres 18.

### Schema conventions

- Files in `src/adapters/drizzle/schema/*.ts`; `index.ts` re-exports only. Business logic
  imports **ports**, never the schema (adapter reachable only via `./adapters/drizzle`).
- isolatedDeclarations: every exported table uses the `_column-types.ts` alias helpers
  (`UuidPk<T>`, `BranchRef<T>`, `TextCol<T,N>`, `MoneyCol<T,N>`, `CreatedAt<T>`,
  `PosTable<Name,Cols>`) — compile-verified with the repo's exact flags; the bare
  `export const x = pgTable(...)` fails TS9010. Type-level tests
  (`expectTypeOf<InferSelectModel<typeof orders>>()`) guard annotation drift per table.
- Money = `numeric(12,2)` (arrives as string — never float). Timestamps `withTimezone`.
- `branch_id uuid not null` on every branch-scoped table.
- drizzle-zod 0.8.3 (peer `^3.25.0 || ^4.0.0` — zod 4 verified) generates CRUD DTOs.
- Auth tables: `schema/auth.ts` is the committed output of `npx auth@1.7.1 generate`
  (branch remap, uuid PKs via `advanced.database.generateId: "uuid"`); drizzle-kit owns ALL
  SQL from then on. CI drift check: regenerate to a temp file and diff.

### RLS model

- Roles: `pos_owner` (LOGIN, owns schema, migrations/seeds — RLS-exempt as owner, R2) and
  `pos_app` (LOGIN, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, runtime). Never
  BYPASSRLS anywhere; never FORCE RLS. `REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
  `ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner` grants DML on future tables (without it every
  new migration table 403s — verified).
- Session vars: `withBranchContext(db, {userId, branchId, role}, fn)` runs
  `select set_config('app.user_id',$1,true), set_config('app.branch_id',$2,true), set_config('app.role',$3,true)`
  inside `db.transaction` — the ONLY sanctioned entry point. The ESLint boundary rule that
  bans raw `set_config`/`db.transaction` elsewhere is `RLS_SYNTAX_BANS` in
  `packages/eslint-config/boundaries.js`, with `rlsSanctionedZone` exempting
  `adapters/drizzle/rls.ts`; `scripts/assert-lint-bans.mjs` proves both the ban and the
  exemption survive into the effective config. Never `is_local=false` on a pooled connection.
- Policy template (from `_policies.ts`, reused verbatim by every table):

```sql
-- select/insert/update: branchGuard
branch_id = (select nullif(current_setting('app.branch_id', true), '')::uuid)
-- delete (role-gated example):
<branchGuard> and (select nullif(current_setting('app.role', true), '')) in ('owner','admin')
```

Four permissive policies per table (`for: select|insert|update|delete`, `to: posApp` where
`posApp = pgRole('pos_app').existing()`), attached via the pgTable third-arg array +
`.enableRLS()`. Future tightening policies use `as: 'restrictive'` (AND, not OR). Anything
needing joins/membership subqueries in USING is **banned** — that authorization moves to app
level (verdict: 14x–1000x degradation reproduced).

- Global tables (`app_config`): `.enableRLS()` + one `select ... using sql\`true\`` policy;
  no write policies (default deny; writes are owner/migration-only).
- Boot guard: on first connection assert `current_user` is not superuser, not BYPASSRLS, and
  ≠ migration role when `NODE_ENV=production`; refuse to serve otherwise (logger.fatal).

### Migrations

- Dev flow: `pnpm db:custom --name=...` (hand-written SQL → journals FIRST, e.g. 0000 roles),
  then `pnpm db:generate --name=<change>` per schema change. `migrations/meta/**` is
  **committed** (diff baseline). `drizzle-kit check` runs in CI. `generate` needs no env
  (verified). **Never `drizzle-kit push`.**
- Shipped: `migrations/**` in the backend `files` allowlist. Programmatic
  `runPosMigrations({connectionString})` wraps `migrate()` from
  `drizzle-orm/node-postgres/migrator` with `pg_advisory_lock(hashtext('nukesai_pos_migrations'))`
  (drizzle has no cross-instance lock — UNVERIFIED whether 0.45.2 added one; the advisory lock
  makes it moot) and **must** pass BOTH `migrationsTable: "nukesai_pos_migrations"` AND
  `migrationsSchema: "public"` (live-verified: default schema is `drizzle`, and
  drizzle.config.ts settings do NOT flow into the programmatic migrator).
- Migrations run from exactly one place: `scripts/db-migrate.ts` (dev/CI) or the CLI
  `init`/`upgrade` — never at request time.
- `scripts/*.ts` run under plain `node --env-file-if-exists=../../.env` (Node ≥24.12 type
  stripping stable; `.ts` extensions in specifiers; no enums — erasableSyntaxOnly already
  enforces). The `--env-file-if-exists` flag goes on the `node` invocation, incl. when driving
  `drizzle-kit`'s bin directly (verdict correction).

### Pool lifecycle, indexes, pagination

- Presets: vercel → `max 10 (env), idle 30s, connect 10s, maxUses 7500, allowExitOnIdle true`;
  server → `max 20-ish (env), idle 60s, maxUses 0, allowExitOnIdle false`. `keepAlive: true`.
  Pool-level `application_name: 'nukesai-pos-backend'` (R11).
- Prod scale: external pooler (PgBouncer/Neon/Supavisor, transaction mode) behind
  `DATABASE_URL`. Consequence: **no drizzle `.prepare('name')`** by default (named prepared
  statements break under transaction pooling) — a `poolerMode` config flag may re-enable it
  for session/direct connections later. Unnamed parameterized queries only.
- Indexes: `branch_id` leads EVERY index; feed queries use
  `(branch_id, created_at DESC, id DESC)` — composes with the RLS InitPlan constant so
  isolation adds no extra scan (EXPLAIN-verified Bitmap Index Scan).
- Pagination: keyset only — `where branchId = $b and (created_at, id) < ($c1,$c2)
order by created_at desc, id desc limit n`. No OFFSET.
- Defense in depth: every repository query ALSO filters `eq(t.branchId, ctx.branchId)` (R2).

---

## 5. Auth (better-auth 1.7.1)

- Compat verified: zod ^4.3.6 dep; optional peers match every locked version; the Drizzle
  adapter arrives as bundled `@better-auth/drizzle-adapter@1.7.1`.
- **Organization plugin ≡ BRANCH** with DB-level remap: `organization→branch`,
  `member→branchMember (organizationId→branchId)`, `invitation→branchInvitation` (CLI
  generate honored the remap — verified). No teams, no dynamicAccessControl. Session's
  `activeOrganizationId` is the active branch pointer (R7). Optional session-column remap to
  `active_branch_id` is **UNVERIFIED** — skip for now; DB column stays
  `active_organization_id`.
- Plugins (order matters): `organization({ ac, roles, creatorRole: "owner", schema: remap })`,
  `bearer()`, `nextCookies()` **last**.
- Config highlights (all injected via `AuthEnv`, zero process.env): `telemetry.enabled: false`;
  `emailAndPassword` + `emailVerification` hooks → `MailPort` (mailpit locally);
  `session: { storeSessionInDatabase: true` — CRITICAL: with secondaryStorage set the default
  silently makes sessions Redis-only — `cookieCache: { enabled: true, maxAge: 300 } }`;
  `rateLimit: { enabled: true, storage: kv ? "secondary-storage" : "database", customRules }`;
  `advanced.database.generateId: "uuid"`; `advanced.cookiePrefix: "pos"`.
- SecondaryStorage = 5 methods incl. `increment(key, ttl)` and `getAndDelete` (verified —
  most published examples miss two and don't compile). ioredis increment uses a single Lua
  script (INCR + EXPIRE-if-1); upstash uses `incr` + `expire(key, ttl, 'NX')`.
- **Permission matrix** (R8): `packages/common/src/auth/permissions.ts` —
  roles `owner|admin|kitchen|bartender|waiter|receptionist|courier`, resources
  `orders|orderItems|tables|reservations|products|payments|reports|settings|staff`, actions
  `read|create|update|delete`; pure `can(role, resource, action)`. Backend `auth/roles.ts`
  derives `ac`/`betterAuthRoles` (merging `defaultStatements` + `ownerAc`/`adminAc` for
  owner/admin so built-in org endpoints stay permission-checked); frontend
  `client/auth/roles.ts` re-derives identically for `organizationClient({ ac, roles })`.
- tRPC integration: `branchGuard` middleware = `getSession` (Headers instance —
  runtime-verified) → require `activeOrganizationId` → `getActiveMember` → `isPosRole` →
  optional `can()` fast-path check → `ctx.rls = { userId, branchId, role }` handed to
  `withBranchContext`. Privileged mutations bypass cookieCache
  (`disableCookieCache` — **UNVERIFIED** option shape; verify before use, fallback:
  `hasPermission` which is DB-backed).
- Mobile: `bearer()` — token from `set-auth-token` response header on sign-in; clients send
  `Authorization: Bearer`; `createPosAuthClient({ getBearerToken })` wires
  `fetchOptions.auth`. After sign-in the client calls `setActiveOrganization`.
- Next mounting: `createAuthRouteHandlers(auth)` (wraps `toNextJsHandler`) →
  `app/api/auth/[...all]/route.ts`. RSC session read:
  `auth.api.getSession({ headers: await headers() })`.
- Schema generation: `npx auth@1.7.1 generate` (the old `@better-auth/cli` is deprecated —
  do not use). Output committed; drizzle-kit owns migrations; CI diff-check on upgrades.

---

## 6. API (tRPC v11 + trpc-to-openapi + Scalar)

**KNOWN RISK RESOLVED, stated plainly**: trpc-to-openapi 3.3.0 works with @trpc/server
11.18.0 AND zod 4.4.3 **provided its peer `zod-openapi` is pinned to 5.4.6** (6.x violates
the `^5.4.4` peer range and pnpm resolved 6.0.1 when unpinned). Proven end-to-end in a
fixture: `generateOpenApiDocument` emitted a correct OpenAPI 3.1.0 doc from zod-4 schemas;
`createOpenApiFetchHandler` served 200/401/400 correctly; typechecked under TS 7.0.2 strict.
The chosen working path: catalog-pin `zod-openapi: 5.4.6`, declare it an explicit backend
dependency (peer of trpc-to-openapi), CI vitest calls `generateOpenApiDocument(appRouter)`
(doc generation is itself the validator).

Architecture per R1/R16:

- Backend ships from `./trpc`: `PosTrpcContext`, `PosTrpcDeps`, `createTRPCContext`,
  `posErrorFormatter`, middleware factories (`createAuthGuard`, `createBranchGuard(check?)`,
  `createRoleGuard(roles)`, `createRateLimit({limit,windowSec,bucket})`,
  `createCacheEffects()`, `createValidation422()`), and **service functions** + zod
  input/output schemas per domain (`services/*.ts` — where the logic and coverage live).
- Consumer scaffold owns the root: `server/trpc.ts` creates
  `initTRPC.context<PosTrpcContext>().meta<OpenApiMeta & PosTrpcMeta>().create({ transformer:
superjson, errorFormatter: posErrorFormatter })`, builds `publicProcedure` /
  `branchProcedure(check)` etc. by `.use()`-ing backend factories, assembles `appRouter`,
  exports `AppRouter`.
- Transformer: **superjson** — trpc-to-openapi IGNORES transformers (README-verified), so
  OpenAPI-exposed procedures must return wire-safe shapes (`z.iso.datetime()` strings, never
  `z.date()`) and MUST declare `.output()` (hard requirement). GET/DELETE inputs: flat
  primitives only.
- Context: `{ session, requestedBranchId (x-branch-id), ip, locale, requestId, logger
(child with requestId/branchId/userId bindings), t (common translator), deps }`.
  `requestId = globalThis.crypto.randomUUID()`; `x-request-id` set via resHeaders.
- Error formatter: strips `data.stack` unless injected `isDev`; attaches
  `z.flattenError(cause)` for ZodError (zod-4 API — `.flatten()` deprecated) and `appCode`
  for AppError; `createValidation422()` re-throws BAD_REQUEST+ZodError as
  `UNPROCESSABLE_CONTENT` so the wire status is a true 422 (code→422 map verified; the
  re-throw path itself needs the one integration test listed in §10).
- Security in handler factories: Origin allowlist check on state-changing methods
  (same `trustedOrigins` list as better-auth), content-length guard (default 1MB —
  `createOpenApiFetchHandler` has NO maxBodySize, verified; Vercel caps ~4.5MB anyway).
- Mounting (scaffold): `/api/trpc/[trpc]` (GET+POST), `/api/rest/[...rest]` (own prefix —
  never a bare `/api` catch-all that would swallow auth/docs), `/api/openapi.json` (memoized
  doc + securitySchemes `{ bearerAuth: { type: 'http', scheme: 'bearer' } }`), `/api/docs`
  (Scalar). All `export const runtime = "nodejs"`; `export const dynamic = "force-dynamic"`
  kept as defense-in-depth (verdict: not strictly required on Next 16 defaults; delete if
  cacheComponents is ever enabled).
- Scalar: `@scalar/nextjs-api-reference` (`ApiReference(config)` returns `() => Response` —
  verified; the Vue `@scalar/api-reference` is the wrong package). Loads its bundle from
  jsdelivr by default — the `cdn` knob is exposed, config-injected, for self-hosting.
- RSC caller: scaffold uses `t.createCallerFactory(appRouter)` (verified present on the
  init instance).
- Frontend client: `@trpc/tanstack-react-query` `createTRPCContext<AppRouter>()`
  (`{ TRPCProvider, useTRPC, useTRPCClient }` — verified) with `httpBatchStreamLink` +
  superjson; SSR-safe QueryClient pattern (browser module singleton, fresh per server
  render) shipped as `client/trpc-provider.tsx`. Mobile: bare `@trpc/client`
  `createTRPCClient` + `httpBatchLink` with async `headers()` injecting bearer token +
  `x-branch-id`, or the OpenAPI surface.

---

## 7. Caching

- Two layers (verified design): adapters implement the minimal string-in/out **CacheStore**
  (`get/set/del/invalidateTags/close`); **`createCache(store, deps)`** implements getOrSet,
  per-instance single-flight, soft-TTL SWR envelope `{v, sea}`, metrics, and policy exactly
  once: **reads fail OPEN** (degrade to loader), **invalidation fails CLOSED** (propagates).
- Keys/tags are branch-structural: `pos:{locationId}:{entity}:{discriminator}` /
  `pos:{locationId}:{entity}` — cross-branch invalidation impossible by construction.
- Redis tags: `SADD pos:tagset:{tag}` at write + `EXPIRE <set> 86400 GT` (extend-only;
  **requires Redis ≥ 7** — Docker pins redis 8, Upstash is 7-compatible); invalidate =
  `SSCAN COUNT 500` + `UNLINK` members + set. Every entry has hard TTL = ttl + staleTtl —
  nothing immortal, leak-free by construction. ioredis `pipeline.exec()` per-command errors
  are checked and thrown (silent orphaned tags otherwise).
- ioredis client: `lazyConnect, maxRetriesPerRequest: 2, enableAutoPipelining,
connectTimeout 5000, capped retryStrategy`, one client per process via globalThis;
  correction adopted: an unhandled ioredis 'error' event does **not** crash node (emitted
  silently) — the listener is mandatory for observability, not crash prevention.
- Upstash: HTTP, stateless, `automaticDeserialization: false` (byte-identical envelopes ⇒
  adapters swappable mid-deployment). Memory: bounded LRU + tag index, injectable clock.
- Stampede: per-instance single-flight + SWR only. **No distributed SET NX lock** (firm).
  SWR background refresh goes through injected `waitUntil` or is awaited — never floating.
- Invalidation discipline: `PosTrpcMeta { cacheInvalidates?: readonly CacheEntity[] | "none" }`;
  the cacheEffects middleware throws INTERNAL for any mutation without a declaration and
  invalidates `buildCacheTag(ctx.branchId, entity)` after success. A vitest canary asserts
  every router namespace maps to a `CacheEntity`.
- Selection: `from-env.ts` — priority Upstash REST > CACHE_URL > memory; dynamic imports keep
  ioredis/@upstash/redis optional peers; logger warning when production falls back to memory.
- Next coexistence: our Redis layer is the SINGLE cache; no `unstable_cache`/`'use cache'`
  over the same data; own-API server fetches use `cache: 'no-store'` (verdict: genuinely
  load-bearing — Next 16 "auto no cache" bakes fetches into static prerenders).

---

## 8. Observability

- **Ports in common** (isomorphic, zero console/node/process.env):
  `observability/logger.ts` — `LoggerPort` (trace..fatal `(message, fields?)`, `child(bindings)`,
  `flush(): Promise<void>` — flush is part of the port so serverless code can await it) +
  `noopLogger`. `observability/analytics.ts` — explicit `AnalyticsEventMap` interface +
  `ANALYTICS_EVENTS: { [E]: z.ZodType<...> }` validators (isolatedDeclarations requires the
  explicit-interface + `z.ZodType` annotation forms — TS9010/TS9013 otherwise, verified),
  `AnalyticsPort`, `createValidatedAnalytics` (validate-then-dispatch, drop-never-throw,
  injectable rng sampling, strict traits allowlist).
- **Errors in common**: `errors/codes.ts` — explicit `ErrorRegistry` interface (as-const-
  satisfies fails isolatedDeclarations) mapping `AppErrorCode → { httpStatus, trpcCode,
severity, safeMessageKey }`; `trpcCode` is a hand-written literal union (common must not
  import @trpc/server). `errors/app-error.ts` — `AppError extends Error` (ES2022 cause),
  `toSafeBody()` is the ONLY wire shape (no stack/cause/internals), `toLogFields()` for
  server logs, `toAppError()` wrapper.
- **pino adapter (backend, server-only)**: pino 10.3.1, default import
  (`export =` types — `import { pino }` loses `.destination`), **never `pino.transport`**
  (worker threads). Vercel: `pino.destination({ sync: true })` (default SonicBoom is async —
  frozen invocations drop buffered tails, source-verified) + await `flush()` before
  returning; server: async default + flush on shutdown. `redact` wildcard paths, level-label
  formatter, injectable destination for tests. Runtime split driven by `BACKEND_RUNTIME`.
- **Global handlers**: `registerGlobalErrorHandlers({logger, runtime, exit?})` — once, from
  `apps/example/instrumentation.ts`; uncaughtException → fatal + flush + exit(1) only on
  `server` (never exit on vercel); unhandledRejection → error, keep serving; returns a
  disposer (`process.off`).
- **Correlation**: requestId via `globalThis.crypto.randomUUID()` (Node ≥20, no import; note:
  browser-side it's secure-context-only); per-request child logger (chindings precomputed —
  cheap, verified); `x-request-id` response header; pg `application_name` at pool level (R11).
- **Frontend logger**: buffered-fetch adapter (`client/logging`) with bounded buffer,
  interval + keepalive flush, `dispose()`; field allowlist before enqueue; backend ingest
  endpoint re-applies pino redaction.
- Zero-console: nothing in the design touches console (pino → sonic-boom fd write; browser →
  fetch). eslint no-console stays repo-wide; env parse failures throw with
  `z.prettifyError` in the message.

---

## 9. i18n

- **Frontend**: i18next 26.4.0 + react-i18next 17.0.12, direct (next-i18next v16 does support
  App Router — corrected premise — but is an app-level integration; wrong layer for a
  library). Layout: neutral `./i18n` subpath (`createPosI18n` — `createInstance()` per
  request/mount, `initAsync: false` (v26 renamed `initImmediate` — gone), `react.useSuspense:
false`, `interpolation.escapeValue: false`; `mergePosResources` deep-merge for consumer
  overrides); `./server` adds `createPosServerI18n` (React `cache()` per-request per-lng —
  NEVER a shared instance + changeLanguage, race-verified); `./client` adds
  `PosI18nProvider` (lazy `useState` instance; locale switch in `useEffect`) +
  `useTranslation` re-export. Server imports `initReactI18next` from
  `react-i18next/initReactI18next` (RSC-safe subpath, zero React imports — verified).
- Locales as per-locale subpaths `./locales/en`, `./locales/ne` (tree-shakable); `en` is the
  key-shape source of truth; other locales typed `PosLocaleResources` (keys fixed, values
  free — `typeof en` literal types reject translations, verified). The library ships types
  but the **consumer owns** the single `declare module 'i18next'` augmentation (CLI
  scaffolds `i18next.d.ts`).
- **Backend/common split (firm)**: common's dependency-free `createTranslator` stays THE
  mechanism for machine-facing messages (error safeMessageKeys, analytics labels); i18next
  never enters common/backend. `backend/src/i18n/resolve-locale.ts`: user pref →
  Accept-Language primary tag → `DEFAULT_LOCALE`; per-request `Translator` on tRPC context.
  Interpolation syntaxes deliberately differ (`{name}` vs `{{name}}`) — a vitest canary
  asserts no `{{` in common locales and no single-brace placeholders in frontend locales.

---

## 10. Testing strategy (100% coverage gate intact)

**Unit (in the root coverage gate, `pnpm test`)** — everything runs on fakes/seams; no
network, no Docker. Decision: **no pg-mem, no testcontainers in the gate** (pg-mem has no
RLS/GUC support; containers make the gate flaky/slow). Seams already designed in:

| Module                                    | Fake/seam                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adapters/drizzle/client.ts`              | `poolFactory` injection (constructor param, default `pg.Pool`); fake pool asserts singleton, single error-listener, idempotent close, config mapping                                       |
| `adapters/drizzle/rls.ts`                 | fake db with recorded `transaction`/`execute` — asserts the exact 3-GUC set_config SQL + rollback propagation                                                                              |
| `adapters/drizzle/migrate.ts`             | injected `migrateFn` + fake pool — asserts advisory lock/unlock ordering, table/schema options, finally-end                                                                                |
| `env.ts`                                  | pure — table-driven parse/refine/error-message tests                                                                                                                                       |
| `cache/create-cache.ts`                   | memory store + fake clock + rng; single-flight (5 concurrent → 1 load), SWR both waitUntil paths, fail-open/closed                                                                         |
| `adapters/cache/redis.ts` / `upstash.ts`  | hand-rolled fake clients implementing the tiny command surface (get/set/pipeline/sadd/expire/sscan/unlink/quit); pipeline-error surfacing test                                             |
| `adapters/auth/secondary-storage.ts`      | fake KvPort — prefixing + 5-method mapping                                                                                                                                                 |
| `auth/roles.ts` + common `permissions.ts` | table test: role × resource × action matrix vs `authorize().success` (also covers the type-widening risk)                                                                                  |
| `auth/index.ts`                           | export `buildAuthOptions(deps)` pure; assert option object (storeSessionInDatabase, plugin order, remap) without invoking betterAuth network paths; `createAuth` smoke with memory adapter |
| `trpc/middleware.ts`                      | fake AuthPort/cache/logger; 401/403/422/429 paths; cacheEffects missing-meta throw; branchGuard header≠active 403                                                                          |
| `internal/trpc/error-mapping.ts`          | ZodError→422 shape, AppError passthrough, logger severity routing                                                                                                                          |
| `adapters/logging/pino.ts`                | injected `DestinationStream` (array sink) — JSON lines, redaction, child bindings, flush                                                                                                   |
| `internal/global-error-handlers.ts`       | injected `exit`; register/dispose in afterEach                                                                                                                                             |
| `adapters/mail/*`                         | injected transport factory; noop covered directly                                                                                                                                          |
| `bootstrap/create-pos.ts`                 | all ports injected; shutdown ordering + idempotency                                                                                                                                        |
| frontend i18n/trpc provider               | jsdom + testing-library (existing setup); http-logger with fake fetch + fake timers                                                                                                        |

Coverage config change: none needed structurally (root `include` already globs
`packages/*/src/**`); keep logic out of `index.ts` barrels; `scripts/**` and
`drizzle.config.ts` are outside `src/` so outside the include glob — also exclude them in
knip production entries and give them the process-env-allowed ESLint zone.

**Integration (opt-in, NOT in the gate)** — root `test:integration` →
`vitest run -c vitest.integration.config.ts` (no coverage thresholds), requires
`pnpm stack:up`; targets `nukes_pos_test`:
RLS live suite (fail-closed no-context, cross-branch INSERT rejection, role-gated DELETE,
the `''`-GUC-residue regression on a max:1 pool — this exact test caught the 22P02 bug),
EXPLAIN assertion (Bitmap Index Scan + InitPlan on hot queries), migration apply +
idempotency + concurrent-migrate advisory-lock test, redis tag invalidation + EXPIRE GT,
better-auth sign-up/getSession/organization flow against real PG, mailpit REST assertion
(`/api/v1/messages`), the 422-through-fetch-adapter test, boot-guard refusal as pos_owner.

**E2E (playwright, existing `pnpm e2e`)** — apps/example against the Docker stack: sign-in →
create branch → setActiveOrganization → create order → KDS list; `/api/openapi.json`
validates; `/api/docs` renders; two-locale render (server + client translated strings);
dist boundary test additions (`"use client"` survives in `dist/client/i18n.js`, server-only
pill in new backend entries).

---

## 11. Open risks & fallbacks

1. **Cross-instance procedure composition** (backend-created procedures into app-created
   `t.router`) — UNVERIFIED at type level. Fallback (already the design): middleware
   factories + service functions; scaffold builds procedures entirely on the app's `t`.
   Verify in the first scaffold commit.
2. **tsdown/oxc dts on the drizzle helper-alias annotations** — fixture verified tsc only.
   Fallback: fully-explicit inline `PgColumn` annotations (also verified). Run the real
   backend build in the first schema commit.
3. **PgBouncer transaction mode** — unexercised. Before GA: docker pgbouncer fixture;
   `.prepare` stays off; session GUCs are safe (transaction-local only).
4. **`disableCookieCache` option shape** (better-auth) and **session-column remap to
   `active_branch_id`** — both UNVERIFIED; one CLI-generate/typecheck spike each before use.
5. **Vercel Fluid** — `attachDatabasePool` export verified; behavior outside Vercel
   UNVERIFIED → gated on `process.env.VERCEL` in apps/example only. Pool math: doctor check
   warns when `max × instances > pooler pool_size`.
6. **better-auth upgrades drifting the committed auth schema** — CI regenerates to temp +
   diffs; build fails on drift.
7. **zod-openapi 6.x creep** — exact catalog pin + syncpack; a renovate-style bump must fail
   the OpenAPI-doc-generation vitest.
8. **@types/nodemailer (8.x) vs nodemailer 9** — adapter confined to
   createTransport/sendMail/close; mailpit integration test catches runtime drift.
9. **Initdb one-shot semantics** — edits to 01-roles.sql silently ignored on existing
   volumes; `stack:nuke` documented; healthcheck uses `pg_isready -h 127.0.0.1` (TCP) to
   dodge the unix-socket init race.
10. **Memory cache silently selected in prod** — env refine warns via logger; consumer
    scaffold's bootstrap requires Redis when NODE_ENV=production.
11. **common size budget** — zod addition requires a dedicated reviewed size-limit commit;
    if the `./observability` budget can't absorb zod, move `ANALYTICS_EVENTS` runtime
    validators to backend and keep only the interfaces in common.

---

## 12. Appendix — canonical file contents

Everything below compiles under strict TS + isolatedDeclarations + exactOptionalPropertyTypes
(fixture-verified forms), no console, no enums, type-only imports. Files marked _(scaffold)_
live in apps/example / CLI templates (app tsconfig — no isolatedDeclarations).

### 12.1 `docker/compose.yaml`

```yaml
# Compose v2 — no `version:` key. Run from repo root:
#   docker compose -f docker/compose.yaml --env-file .env up -d --wait
name: nukes-pos

services:
  postgres:
    image: postgres:18.6-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POS_PG_SUPERUSER:-postgres}
      POSTGRES_PASSWORD: ${POS_PG_SUPERPASS:-postgres}
      POSTGRES_DB: ${POS_PG_DB:-nukes_pos}
    ports:
      - "${POS_PG_PORT:-5432}:5432"
    volumes:
      # postgres:18+ moved the VOLUME to /var/lib/postgresql (PGDATA=/var/lib/postgresql/18/docker).
      # Mounting the old /data path silently writes OUTSIDE the volume (verified).
      - pos-pg-data:/var/lib/postgresql
      - ./initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      # -h 127.0.0.1 forces TCP: the init-time temp server is unix-socket-only, so this
      # cannot go green before initdb scripts finish. $$ escapes compose interpolation.
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 10s

  redis:
    image: redis:8.10-alpine # EXPIRE ... GT needs Redis >= 7 (tag-set TTL refresh)
    restart: unless-stopped
    ports:
      - "${POS_REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12

  mailpit:
    image: axllent/mailpit:v1.30
    restart: unless-stopped
    ports:
      - "${POS_SMTP_PORT:-1025}:1025"
      - "${POS_MAILPIT_PORT:-8025}:8025"
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
    # Image bakes in HEALTHCHECK CMD ["/mailpit","readyz"] — --wait works out of the box.

volumes:
  pos-pg-data:
```

### 12.2 `docker/initdb/01-roles.sql`

```sql
-- Runs ONCE as the compose superuser on an EMPTY volume. Later edits are silently
-- ignored until `pnpm stack:nuke`. Same script runs once via psql on managed PG.
-- DEV-ONLY passwords. Keep POS_PG_DB=nukes_pos or edit this file.

-- Migration/DDL owner. NOT superuser. Owns schema + tables (RLS-exempt as owner: the
-- sanctioned bypass channel for migrations/seeds — never grant BYPASSRLS, never FORCE RLS).
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_owner') THEN
    CREATE ROLE pos_owner LOGIN PASSWORD 'pos_owner' NOSUPERUSER NOCREATEROLE NOCREATEDB;
  END IF;
END $$;

-- Runtime role. Subject to RLS. DATABASE_URL uses this one.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_app') THEN
    CREATE ROLE pos_app LOGIN PASSWORD 'pos_app'
      NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
  END IF;
END $$;

ALTER DATABASE nukes_pos OWNER TO pos_owner;
GRANT CONNECT ON DATABASE nukes_pos TO pos_app;

-- Second database for vitest integration / playwright — same container.
CREATE DATABASE nukes_pos_test OWNER pos_owner;
GRANT CONNECT ON DATABASE nukes_pos_test TO pos_app;

\connect nukes_pos
ALTER SCHEMA public OWNER TO pos_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pos_app;
-- Without DEFAULT PRIVILEGES every future migration-created table 403s for pos_app (verified).
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pos_app;

\connect nukes_pos_test
ALTER SCHEMA public OWNER TO pos_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pos_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pos_app;
```

### 12.3 `.env.example` (repo root)

```bash
# Copy to .env, then: ln -s ../../.env apps/example/.env.local
# compose reads via --env-file; backend scripts via --env-file-if-exists; next dev via symlink.
# On Vercel: enter the app vars below in the dashboard (never MIGRATE_DATABASE_URL).

# ---- docker compose knobs (local only; POS_PG_DB must stay nukes_pos, see initdb) ----
POS_PG_SUPERUSER=postgres
POS_PG_SUPERPASS=postgres
POS_PG_DB=nukes_pos
POS_PG_PORT=5432
POS_REDIS_PORT=6379
POS_SMTP_PORT=1025
POS_MAILPIT_PORT=8025

# ---- app runtime (parsed by @nukesai-pos/backend/env) ----
NODE_ENV=development
BACKEND_RUNTIME=server            # server | vercel

DATABASE_URL=postgresql://pos_app:pos_app@localhost:5432/nukes_pos
MIGRATE_DATABASE_URL=postgresql://pos_owner:pos_owner@localhost:5432/nukes_pos
DATABASE_POOL_MAX=10              # Vercel: 5; prod DATABASE_URL must be a pooler URL
DATABASE_POOL_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECT_TIMEOUT_MS=10000
DATABASE_POOL_MAX_USES=0          # vercel preset: 7500
DATABASE_SSL=false

CACHE_DRIVER=ioredis              # memory | ioredis | upstash
CACHE_URL=redis://localhost:6379
CACHE_KEY_PREFIX=pos
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=

BETTER_AUTH_SECRET=dev-only-secret-change-me-0123456789abcdef   # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
AUTH_TRUSTED_ORIGINS=http://localhost:3000
# AUTH_COOKIE_DOMAIN=

MAIL_DRIVER=smtp                  # smtp -> mailpit locally; noop in tests
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
# SMTP_USER=
# SMTP_PASS=
MAIL_FROM=no-reply@nukesai.local

LOG_LEVEL=debug
ANALYTICS_DRIVER=noop
# ANALYTICS_WRITE_KEY=
API_MAX_BODY_BYTES=1048576
DEFAULT_LOCALE=en

# Integration tests: TEST_DATABASE_URL=postgresql://pos_app:pos_app@localhost:5432/nukes_pos_test
# (migrate role for tests: postgresql://pos_owner:pos_owner@localhost:5432/nukes_pos_test)
```

### 12.4 `packages/backend/drizzle.config.ts`

```ts
import { defineConfig, type Config } from "drizzle-kit";

// Dev-time only (drizzle-kit is a devDependency, never shipped).
//   db:generate => drizzle-kit generate --name=<change>          (no env/DB needed — verified)
//   db:custom   => drizzle-kit generate --custom --name=<change> (hand-written SQL, e.g. 0000 roles)
//   db:check    => drizzle-kit check                             (CI journal/snapshot gate)
// Committed output: migrations/NNNN_*.sql + migrations/meta/**  (files allowlist gains "migrations")
const config: Config = defineConfig({
  dialect: "postgresql",
  schema: "./src/adapters/drizzle/schema/index.ts",
  out: "./migrations",
  // Applies to `drizzle-kit migrate` only; the programmatic migrator repeats it (verified split).
  migrations: { table: "nukesai_pos_migrations", schema: "public" },
  strict: true,
  verbose: true,
});

export default config;
```

### 12.5 `packages/backend/migrations/0000_bootstrap-roles.sql`

```sql
-- Custom migration created via `drizzle-kit generate --custom --name=bootstrap-roles`
-- BEFORE the first schema generate so it journals as 0000 (ordering verified).
-- Idempotent: coexists with docker/initdb (which creates pos_app LOGIN); on consumer DBs
-- where initdb never ran, this prevents CREATE POLICY 42704 (live-verified failure).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pos_app') THEN
    CREATE ROLE pos_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO pos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pos_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;
-- Operator creates the LOGIN user and GRANTs pos_app to it; the login user must NOT own
-- the tables (owners bypass RLS) and must never be BYPASSRLS.
```

### 12.6 `packages/backend/src/env.ts`

```ts
import { z } from "zod";

/**
 * The ONLY module in this package that interprets environment values. It never reads
 * process.env — the consumer passes a record into createNukesPos({ env: process.env }).
 * Deliberately NOT importing "server-only": scripts/db-migrate.ts runs this under plain
 * Node, where importing server-only throws (verified). The pill lives in entrypoints.
 */

const pgUrl = z.url({ protocol: /^postgres(ql)?$/ });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    BACKEND_RUNTIME: z.enum(["server", "vercel"]).default("server"),

    DATABASE_URL: pgUrl,
    MIGRATE_DATABASE_URL: pgUrl.optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(1000).default(10),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
    DATABASE_POOL_MAX_USES: z.coerce.number().int().min(0).default(0),
    DATABASE_SSL: z.stringbool().default(false),

    CACHE_DRIVER: z.enum(["memory", "ioredis", "upstash"]).default("memory"),
    CACHE_URL: z.url({ protocol: /^rediss?$/ }).optional(),
    CACHE_KEY_PREFIX: z.string().min(1).default("pos"),
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    AUTH_TRUSTED_ORIGINS: z.string().default(""),
    AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),

    MAIL_DRIVER: z.enum(["smtp", "noop"]).default("noop"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    MAIL_FROM: z.email().default("no-reply@localhost"),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    ANALYTICS_DRIVER: z.enum(["noop", "webhook"]).default("noop"),
    ANALYTICS_WRITE_KEY: z.string().min(1).optional(),
    API_MAX_BODY_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
    DEFAULT_LOCALE: z.string().min(2).default("en"),
  })
  .refine((e) => e.CACHE_DRIVER !== "ioredis" || e.CACHE_URL !== undefined, {
    error: "CACHE_DRIVER=ioredis requires CACHE_URL",
    path: ["CACHE_URL"],
  })
  .refine(
    (e) =>
      e.CACHE_DRIVER !== "upstash"
      || (e.UPSTASH_REDIS_REST_URL !== undefined && e.UPSTASH_REDIS_REST_TOKEN !== undefined),
    {
      error: "CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
      path: ["UPSTASH_REDIS_REST_URL"],
    },
  )
  .refine((e) => e.MAIL_DRIVER !== "smtp" || e.SMTP_HOST !== undefined, {
    error: "MAIL_DRIVER=smtp requires SMTP_HOST",
    path: ["SMTP_HOST"],
  });

export type PosEnv = z.infer<typeof envSchema>;
export type PosEnvSource = Readonly<Record<string, string | undefined>>;

export function parseEnv(source: PosEnvSource): PosEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `[@nukesai-pos/backend] Invalid environment:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function parseTrustedOrigins(env: PosEnv): readonly string[] {
  const fromCsv = env.AUTH_TRUSTED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const base = new URL(env.BETTER_AUTH_URL).origin;
  return [...new Set([base, ...fromCsv])];
}
```

### 12.7 `packages/backend/src/adapters/drizzle/schema/_policies.ts`

```ts
import { sql, type SQL } from "drizzle-orm";
import { pgRole, type PgRole } from "drizzle-orm/pg-core";

/** Created by initdb / 0000_bootstrap-roles.sql; .existing() keeps drizzle-kit off it. */
export const posApp: PgRole = pgRole("pos_app").existing();

/**
 * Fail-closed branch predicate — reused by EVERY policy.
 * nullif handles BOTH unset (NULL) and post-transaction '' residue on pooled connections
 * (bare ::uuid on '' throws 22P02 — live-verified). The (select ...) wrap hoists the call
 * into a one-shot InitPlan (~3x; the real cliff — subqueries/joins in USING — is banned).
 */
export const branchGuard = (col: unknown): SQL =>
  sql`${col} = (select nullif(current_setting('app.branch_id', true), '')::uuid)`;

/** Role gate fragment for privileged policies (e.g. DELETE to owner/admin only). */
export const roleIn = (roles: readonly string[]): SQL =>
  sql`(select nullif(current_setting('app.role', true), '')) in (${sql.join(
    roles.map((r) => sql`${r}`),
    sql`, `,
  )})`;
```

### 12.8 `packages/backend/src/adapters/drizzle/schema/orders.ts` (template for all branch tables)

```ts
import { sql } from "drizzle-orm";
import {
  index,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { branchGuard, posApp, roleIn } from "./_policies.js";
import type { BranchRef, CreatedAt, MoneyCol, PosTable, TextCol, UuidPk } from "./_column-types.js";

export const orderStatus = pgEnum("order_status", [
  "draft",
  "placed",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
]);

export const orders: PosTable<
  "orders",
  {
    id: UuidPk<"orders">;
    branchId: BranchRef<"orders">;
    status: TextCol<"orders", "status">;
    total: MoneyCol<"orders", "total">;
    createdAt: CreatedAt<"orders">;
  }
> = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").notNull(),
    status: text("status").notNull().default("draft"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // branch_id leads EVERY index; this one serves the keyset feed query exactly.
    index("orders_branch_created_id_idx").on(t.branchId, t.createdAt.desc(), t.id.desc()),
    pgPolicy("orders_select", {
      as: "permissive",
      for: "select",
      to: posApp,
      using: branchGuard(t.branchId),
    }),
    pgPolicy("orders_insert", {
      as: "permissive",
      for: "insert",
      to: posApp,
      withCheck: branchGuard(t.branchId),
    }),
    pgPolicy("orders_update", {
      as: "permissive",
      for: "update",
      to: posApp,
      using: branchGuard(t.branchId),
      withCheck: branchGuard(t.branchId),
    }),
    pgPolicy("orders_delete", {
      as: "permissive",
      for: "delete",
      to: posApp,
      using: sql`${branchGuard(t.branchId)} and ${roleIn(["owner", "admin"])}`,
    }),
  ],
).enableRLS();

export const orderInsertSchema: ReturnType<typeof createInsertSchema<typeof orders>> =
  createInsertSchema(orders);
export const orderSelectSchema: ReturnType<typeof createSelectSchema<typeof orders>> =
  createSelectSchema(orders);
```

(`_column-types.ts` is adopted verbatim from the drizzle researcher's compile-verified
snippet. `schema/auth.ts` is the committed `npx auth@1.7.1 generate` output — see rbac
researcher snippet — with uuid PKs and the branch/branchMember/branchInvitation remap.)

### 12.9 `packages/backend/src/adapters/drizzle/client.ts`

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type * as schema from "./schema/index.js";
import type { PosEnv } from "../../env.js";

const { Pool } = pg;

export type PosSchema = typeof schema;
export type PosDatabase = NodePgDatabase<PosSchema>;

export interface PosDbConfig {
  readonly connectionString: string;
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly connectionTimeoutMillis: number;
  readonly maxUses: number; // 0 = unlimited
  readonly allowExitOnIdle: boolean;
  readonly ssl: boolean;
  readonly onPoolError: (error: Error) => void; // MANDATORY: idle-client errors crash node otherwise
}

export function dbConfigFromEnv(env: PosEnv, onPoolError: (e: Error) => void): PosDbConfig {
  const vercel = env.BACKEND_RUNTIME === "vercel";
  return {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
    maxUses: env.DATABASE_POOL_MAX_USES > 0 ? env.DATABASE_POOL_MAX_USES : vercel ? 7_500 : 0,
    allowExitOnIdle: vercel,
    ssl: env.DATABASE_SSL,
    onPoolError,
  };
}

export interface PosDb {
  readonly db: PosDatabase;
  readonly pool: pg.Pool;
  /** Idempotent. After resolve, totalCount === 0. */
  readonly close: () => Promise<void>;
}

interface DbGlobal {
  instance?: PosDb;
  closing?: Promise<void>;
}

// Symbol.for + globalThis: one pool per process — survives Next dev HMR and Fluid reuse.
const GLOBAL_KEY = Symbol.for("@nukesai-pos/backend:drizzle-pool");
const globalStore = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DbGlobal };

export type PoolFactory = (options: pg.PoolConfig) => pg.Pool; // test seam

export function createPosDb(
  config: PosDbConfig,
  schemaModule: PosSchema,
  poolFactory: PoolFactory = (o) => new Pool(o),
): PosDb {
  const store: DbGlobal = (globalStore[GLOBAL_KEY] ??= {});
  if (store.instance !== undefined) return store.instance;

  const pool = poolFactory({
    connectionString: config.connectionString,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    maxUses: config.maxUses === 0 ? Infinity : config.maxUses,
    allowExitOnIdle: config.allowExitOnIdle,
    keepAlive: true,
    application_name: "nukesai-pos-backend", // pool-level; requestId travels in log fields (R11)
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
  });
  pool.on("error", config.onPoolError);

  const db: PosDatabase = drizzle({ client: pool, schema: schemaModule });

  const close = (): Promise<void> => {
    store.closing ??= pool.end().finally(() => {
      delete store.instance;
      delete store.closing;
    });
    return store.closing;
  };

  store.instance = { db, pool, close };
  return store.instance;
}
```

### 12.10 `packages/backend/src/adapters/drizzle/rls.ts`

```ts
import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { PosDatabase, PosSchema } from "./client.js";

export interface BranchContext {
  readonly userId: string;
  readonly branchId: string;
  readonly role: string; // PosRole — validated upstream by the better-auth session
}

export type PosTx = NodePgTransaction<PosSchema, ExtractTablesWithRelations<PosSchema>>;

/**
 * The ONLY sanctioned db entry point with request context (lint-enforced).
 * set_config(..., true) === SET LOCAL but parameterizable; live-verified to revert on
 * COMMIT and ROLLBACK — nothing leaks across pooled connections. ctx MUST come from the
 * better-auth session, never from request input.
 */
export async function withBranchContext<T>(
  db: PosDatabase,
  ctx: BranchContext,
  fn: (tx: PosTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('app.user_id',   ${ctx.userId},   true),
        set_config('app.branch_id', ${ctx.branchId}, true),
        set_config('app.role',      ${ctx.role},     true)
    `);
    return fn(tx);
  });
}
```

### 12.11 `packages/backend/src/adapters/drizzle/migrate.ts`

```ts
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

// dist/adapters/drizzle/migrate.js -> ../../../migrations (same depth from src/ in tests).
const SHIPPED_MIGRATIONS: string = fileURLToPath(new URL("../../../migrations", import.meta.url));

export interface MigrateOptions {
  /** DIRECT connection (never transaction-pooled) with DDL rights (pos_owner). */
  readonly connectionString: string;
  readonly migrationsFolder?: string;
}

export type MigrateFn = typeof migrate; // test seam

export async function runPosMigrations(
  options: MigrateOptions,
  migrateFn: MigrateFn = migrate,
): Promise<void> {
  const pool = new Pool({ connectionString: options.connectionString, max: 1 });
  try {
    const db: NodePgDatabase = drizzle({ client: pool });
    // Serialize deploy fan-out; drizzle's migrator has no cross-instance lock of its own.
    await db.execute(sql`select pg_advisory_lock(hashtext('nukesai_pos_migrations'))`);
    try {
      await migrateFn(db, {
        migrationsFolder: options.migrationsFolder ?? SHIPPED_MIGRATIONS,
        // BOTH required: default schema is 'drizzle', and drizzle.config.ts does NOT apply
        // to the programmatic migrator (live-verified 42P01 without these).
        migrationsTable: "nukesai_pos_migrations",
        migrationsSchema: "public",
      });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(hashtext('nukesai_pos_migrations'))`);
    }
  } finally {
    await pool.end();
  }
}
```

### 12.12 `packages/common/src/auth/permissions.ts`

Adopted verbatim from the rls researcher's typechecked snippet: `POS_RESOURCES`,
`POS_ACTIONS`, `POS_ROLES`, `PERMISSION_MATRIX` (explicit `PermissionMatrix` annotation),
`can(role, resource, action)`. Zero deps, isomorphic, exported via new `./auth` subpath.

### 12.13 `packages/backend/src/auth/roles.ts`

Adopted from the rls researcher's typechecked derivation, extended with the org defaults so
built-in endpoints stay permission-checked:

```ts
import { createAccessControl } from "better-auth/plugins/access";
import type { AccessControl, Role, Statements } from "better-auth/plugins/access";
import { adminAc, defaultStatements, ownerAc } from "better-auth/plugins/organization/access";
import {
  PERMISSION_MATRIX,
  POS_ACTIONS,
  POS_RESOURCES,
  POS_ROLES,
  type PosAction,
  type PosResource,
  type PosRole,
} from "@nukesai-pos/common/auth";

type DomainStatements = Record<PosResource, readonly PosAction[]>;
export type PosStatements = typeof defaultStatements & DomainStatements;

const domain: DomainStatements = Object.fromEntries(
  POS_RESOURCES.map((r) => [r, POS_ACTIONS]),
) as DomainStatements;

export const ac: AccessControl<PosStatements> = createAccessControl({
  ...defaultStatements,
  ...domain,
});

export type PosRoleDefinition = Role<Statements, PosStatements>;

const grantsFor = (name: PosRole): Partial<Record<PosResource, PosAction[]>> => {
  const grants: Partial<Record<PosResource, PosAction[]>> = {};
  for (const res of POS_RESOURCES) {
    const acts = PERMISSION_MATRIX[name][res];
    if (acts !== undefined) grants[res] = [...acts];
  }
  return grants;
};

export const posRoles: Record<PosRole, PosRoleDefinition> = Object.fromEntries(
  POS_ROLES.map((name) => {
    const base = name === "owner" ? ownerAc.statements : name === "admin" ? adminAc.statements : {};
    return [name, ac.newRole({ ...base, ...grantsFor(name) } as PosStatements)];
  }),
) as Record<PosRole, PosRoleDefinition>;

export function isPosRole(value: string): value is PosRole {
  return (POS_ROLES as readonly string[]).includes(value);
}
```

(`packages/frontend/src/client/auth/roles.ts` repeats the same derivation against the same
common matrix — frontend may not import backend; a per-package table test locks both.)

### 12.14 `packages/backend/src/auth/index.ts`

Adopted from the rbac researcher's fixture-verified factory (`AuthEnv`, `CreateAuthDeps`,
`PosOrgPlugin` via `DefaultOrganizationPlugin`, `PosAuth = Auth<PosAuthOptions>`), with these
bound decisions: `ac`/`posRoles` imported from `./roles.js` (12.13); `buildAuthOptions`
**exported** (unit-testable pure); `storeSessionInDatabase: true`; `telemetry.enabled:false`;
rateLimit storage from `deps.secondaryStorage` presence; plugin order
`organization → bearer → nextCookies` (nextCookies LAST); org schema remap
`organization→branch`, `member→branchMember(organizationId→branchId)`,
`invitation→branchInvitation(organizationId→branchId)`;
`advanced: { cookiePrefix: "pos", database: { generateId: "uuid" } }`; mail hooks via
`MailPort`. `adapters/auth/secondary-storage.ts` maps `KvPort` → the 5-method
`SecondaryStorage` verbatim from the verified snippet.

### 12.15 `packages/backend/src/ports/kv.ts`

```ts
/** Minimal Redis-protocol surface implemented by the ioredis and upstash adapters.
 *  Shapes match better-auth 1.7's SecondaryStorage requirements (5 methods, verified). */
export interface KvPort {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  /** Redis GETDEL. */
  readonly getAndDelete: (key: string) => Promise<string | null>;
  /** Atomic INCR; TTL applies only on key creation (fixed window).
   *  ioredis: single Lua (INCR; if 1 then EXPIRE). upstash: incr + expire(key, ttl, "NX"). */
  readonly incrementWithTtl: (key: string, ttlSeconds: number) => Promise<number>;
}
```

`ports/cache.ts`, `cache/create-cache.ts`, `adapters/cache/{redis,upstash,memory}.ts`, and
`cache/from-env.ts` are adopted verbatim from the cache researcher's runtime-verified
snippets, with two amendments: the redis/upstash adapter files additionally export
`createRedisKv(client): KvPort` / `createUpstashKv(client): KvPort` over the same client
(R14), and `from-env.ts` takes `PosEnv` (12.6) instead of a raw record.

### 12.16 `packages/backend/src/trpc/init.ts`

```ts
import "server-only";
import { TRPCError } from "@trpc/server";
import { ZodError, z } from "zod";
import type { OpenApiMeta } from "trpc-to-openapi";
import { AppError, type LoggerPort, type AnalyticsPort } from "@nukesai-pos/common";
import type { PosRole } from "@nukesai-pos/common/auth";
import type { Translator } from "@nukesai-pos/common/i18n";
import type { CachePort } from "../ports/cache.js";
import type { PosAuth } from "../auth/index.js";
import type { PosDatabase } from "../adapters/drizzle/client.js";

export type CacheEntity = "orders" | "tables" | "menu" | "reservations" | "reports" | "branches";

/** Every MUTATION must declare cacheInvalidates (entities or "none") — enforced by middleware. */
export interface PosTrpcMeta extends OpenApiMeta {
  readonly cacheInvalidates?: readonly CacheEntity[] | "none";
}

export interface PosTrpcDeps {
  readonly auth: PosAuth;
  readonly db: PosDatabase;
  readonly cache: CachePort;
  readonly logger: LoggerPort;
  readonly analytics: AnalyticsPort;
  readonly isDev: boolean;
  readonly trustedOrigins: readonly string[];
  readonly defaultLocale: string;
  readonly translatorFor: (locale: string) => Translator;
}

export interface PosSessionInfo {
  readonly userId: string;
  readonly activeBranchId: string | null; // session.activeOrganizationId
}

export interface PosTrpcContext {
  readonly session: PosSessionInfo | null;
  readonly requestedBranchId: string | null; // x-branch-id header (must equal active branch, R7)
  readonly ip: string | null;
  readonly requestId: string;
  readonly logger: LoggerPort;
  readonly t: Translator;
  readonly deps: PosTrpcDeps;
}

export async function createTRPCContext(req: Request, deps: PosTrpcDeps): Promise<PosTrpcContext> {
  const raw = await deps.auth.api.getSession({ headers: req.headers });
  const session: PosSessionInfo | null = raw
    ? { userId: raw.user.id, activeBranchId: raw.session.activeOrganizationId ?? null }
    : null;
  const requestId = globalThis.crypto.randomUUID();
  const locale =
    req.headers.get("accept-language")?.split(",")[0]?.split("-")[0] ?? deps.defaultLocale;
  return {
    session,
    requestedBranchId: req.headers.get("x-branch-id"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    requestId,
    logger: deps.logger.child({ requestId, userId: session?.userId ?? "anon" }),
    t: deps.translatorFor(locale),
    deps,
  };
}

export interface SafeErrorShapeData {
  readonly code: string;
  readonly messageKey: string;
  readonly httpStatus: number;
  readonly requestId: string | undefined;
  readonly zod: ReturnType<typeof z.flattenError> | null;
}

/** Passed by the scaffold into initTRPC's create({ errorFormatter: posErrorFormatter }). */
export function posErrorFormatter(opts: {
  readonly shape: {
    readonly message: string;
    readonly code: number;
    readonly data: Record<string, unknown>;
  };
  readonly error: TRPCError;
  readonly ctx: PosTrpcContext | undefined;
}): { message: string; code: number; data: Record<string, unknown> } {
  const { shape, error, ctx } = opts;
  const zod = error.cause instanceof ZodError ? z.flattenError(error.cause) : null;
  const appError = error.cause instanceof AppError ? error.cause : null;
  const { stack: _stack, ...data } = shape.data;
  return {
    ...shape,
    data: {
      ...data,
      ...(ctx?.deps.isDev === true ? { stack: _stack } : {}), // never leak stacks in prod
      zod,
      appCode: appError?.code ?? null,
      requestId: ctx?.requestId,
    },
  };
}
```

### 12.17 `packages/backend/src/trpc/middleware.ts` (factory shapes)

All factories return values annotated with the exported `TRPCMiddlewareBuilder<PosTrpcContext,
PosTrpcMeta, object, unknown>` type from `@trpc/server` (compile-verified under
isolatedDeclarations). Behavior:

```text
createAuthGuard()            401 when ctx.session === null; narrows session non-null.
createBranchGuard(check?)    401 no session → 400 no active branch → 403 when x-branch-id
                             present and ≠ activeBranchId (R7) → getActiveMember →
                             403 !isPosRole → 403 when check && !can(role, ...) →
                             next({ ctx: { rls: { userId, branchId, role } } }).
createRoleGuard(roles)       403 unless member role ∈ roles.
createRateLimit(opts)        key `rl:{bucket}:{path}:{userId ?? ip ?? anon}` via
                             kv.incrementWithTtl; > limit → TOO_MANY_REQUESTS. Place AFTER auth.
createValidation422()        try next(); catch TRPCError BAD_REQUEST with ZodError cause →
                             re-throw UNPROCESSABLE_CONTENT (wire 422 — map verified).
createCacheEffects()         mutations without meta.cacheInvalidates → INTERNAL (hard error);
                             on success, invalidateTags(buildCacheTag(rls.branchId, entity))
                             — invalidation failure propagates (fail closed).
```

### 12.18 `packages/backend/src/next/handlers.ts` (router-parameterized, R1)

Adopted from the trpc-openapi researcher's verified factories with one structural change —
the router is a parameter, not an import:

```ts
import "server-only";
import type { AnyTRPCRouter } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import {
  createOpenApiFetchHandler,
  generateOpenApiDocument,
  type OpenAPIObject,
} from "trpc-to-openapi";
import { ApiReference } from "@scalar/nextjs-api-reference";
import type { PosTrpcContext } from "../trpc/init.js";

export interface ApiHandlerConfig {
  readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  readonly trustedOrigins: readonly string[];
  readonly maxBodyBytes: number; // createOpenApiFetchHandler has NO maxBodySize (verified)
  readonly onError: (info: { path: string | undefined; code: string; message: string }) => void;
  readonly restBaseUrl: string;
  readonly docs?: { readonly cdn?: string; readonly title?: string } | undefined;
}

type Handler = (req: Request) => Promise<Response>;

function guard(req: Request, cfg: ApiHandlerConfig): Response | null {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin !== null && !cfg.trustedOrigins.includes(origin)) {
      return new Response("Forbidden origin", { status: 403 });
    }
    if (Number(req.headers.get("content-length") ?? "0") > cfg.maxBodyBytes) {
      return new Response("Payload too large", { status: 413 });
    }
  }
  return null;
}

export function createTrpcHandlers(
  router: AnyTRPCRouter,
  cfg: ApiHandlerConfig,
): { GET: Handler; POST: Handler } {
  const handler: Handler = async (req) => {
    const rejected = guard(req, cfg);
    if (rejected !== null) return rejected;
    return fetchRequestHandler({
      endpoint: "/api/trpc",
      req,
      router,
      createContext: () => cfg.createContext(req),
      onError: ({ error, path }) => cfg.onError({ path, code: error.code, message: error.message }),
    });
  };
  return { GET: handler, POST: handler };
}

export function createOpenApiHandlers(
  router: AnyTRPCRouter,
  cfg: ApiHandlerConfig,
): Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler> {
  const handler: Handler = async (req) => {
    const rejected = guard(req, cfg);
    if (rejected !== null) return rejected;
    return createOpenApiFetchHandler({
      endpoint: "/api/rest",
      req,
      router,
      createContext: () => cfg.createContext(req),
      onError: ({ error, path }) => cfg.onError({ path, code: error.code, message: error.message }),
    });
  };
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}

export function createOpenApiJsonHandler(router: AnyTRPCRouter, cfg: ApiHandlerConfig): Handler {
  let doc: OpenAPIObject | null = null;
  return async () => {
    doc ??= generateOpenApiDocument(router, {
      title: cfg.docs?.title ?? "Nukes AI POS API",
      version: "1.0.0",
      baseUrl: cfg.restBaseUrl,
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    });
    return Response.json(doc, {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=86400" },
    });
  };
}

export function createDocsHandler(cfg: ApiHandlerConfig): () => Response {
  return ApiReference({
    url: "/api/openapi.json",
    ...(cfg.docs?.cdn !== undefined ? { cdn: cfg.docs.cdn } : {}),
    authentication: { preferredSecurityScheme: "bearerAuth" },
  });
}
```

(NOTE: `AnyTRPCRouter` export name in 11.18.0 — verify exact identifier (`AnyRouter` in some
builds) at implementation; both are historically exported.)

### 12.19 `packages/backend/src/bootstrap/create-pos.ts`

```ts
import "server-only";
import type pg from "pg";
import { parseEnv, parseTrustedOrigins, type PosEnv, type PosEnvSource } from "../env.js";
import { createPosDb, dbConfigFromEnv, type PosDatabase } from "../adapters/drizzle/client.js";
import * as schema from "../adapters/drizzle/schema/index.js";
import { createAuth, type PosAuth } from "../auth/index.js";
import { createSecondaryStorage } from "../adapters/auth/secondary-storage.js";
import { createCacheFromEnv } from "../cache/from-env.js";
import { createPinoLogger } from "../adapters/logging/pino.js";
import { createNodemailerMail } from "../adapters/mail/nodemailer.js";
import { createNoopMail } from "../adapters/mail/noop.js";
import { createTRPCContext, type PosTrpcContext, type PosTrpcDeps } from "../trpc/init.js";
import { createRequestTranslator, defaultLocaleConfig } from "../i18n/resolve-locale.js";
import type { CachePort } from "../ports/cache.js";
import type { KvPort } from "../ports/kv.js";
import type { MailPort } from "../ports/mail.js";
import type { LoggerPort, AnalyticsPort } from "@nukesai-pos/common";
import { noopAnalytics } from "@nukesai-pos/common/observability";

export interface CreateNukesPosOptions {
  readonly env: PosEnvSource;
  readonly onPoolCreated?: ((pool: pg.Pool) => void) | undefined; // Vercel: attachDatabasePool
  readonly waitUntil?: ((p: Promise<unknown>) => void) | undefined;
  readonly mail?: MailPort | undefined;
  readonly logger?: LoggerPort | undefined;
}

export interface NukesPos {
  readonly env: PosEnv;
  readonly pool: pg.Pool;
  readonly db: PosDatabase;
  readonly auth: PosAuth;
  readonly cache: CachePort;
  readonly kv: KvPort | null;
  readonly mail: MailPort;
  readonly logger: LoggerPort;
  readonly analytics: AnalyticsPort;
  readonly trpc: {
    readonly deps: PosTrpcDeps;
    readonly createContext: (req: Request) => Promise<PosTrpcContext>;
  };
  readonly shutdown: () => Promise<void>;
}

export async function createNukesPos(options: CreateNukesPosOptions): Promise<NukesPos> {
  const env = parseEnv(options.env);
  const logger =
    options.logger
    ?? createPinoLogger({
      level: env.LOG_LEVEL === "silent" ? "fatal" : env.LOG_LEVEL,
      runtime: env.BACKEND_RUNTIME,
      redactPaths: ["*.password", "*.token", "*.secret", "user.email"],
      base: { service: "nukesai-pos-backend", env: env.NODE_ENV },
    });

  const posDb = createPosDb(
    dbConfigFromEnv(env, (error) => logger.error("pg.pool.error", { message: error.message })),
    schema,
  );
  options.onPoolCreated?.(posDb.pool);

  const { cache, kv } = await createCacheFromEnv(env, {
    onStoreError: (error) => logger.error("cache.store.error", { message: error.message }),
    ...(options.waitUntil !== undefined ? { waitUntil: options.waitUntil } : {}),
  });

  const mail: MailPort =
    options.mail ?? (env.MAIL_DRIVER === "smtp" ? createNodemailerMail(env) : createNoopMail());

  const trustedOrigins = parseTrustedOrigins(env);
  const auth = createAuth({
    env: {
      secret: env.BETTER_AUTH_SECRET,
      baseUrl: env.BETTER_AUTH_URL,
      trustedOrigins,
      cookieDomain: env.AUTH_COOKIE_DOMAIN,
      appName: "Nukes AI POS",
    },
    db: posDb.db,
    schema,
    secondaryStorage: kv === null ? undefined : createSecondaryStorage(kv, "ba:"),
    mailer: mail,
  });

  const analytics: AnalyticsPort = noopAnalytics; // webhook adapter arrives in a later phase
  const localeConfig = defaultLocaleConfig(env.DEFAULT_LOCALE);

  const deps: PosTrpcDeps = {
    auth,
    db: posDb.db,
    cache,
    logger,
    analytics,
    isDev: env.NODE_ENV === "development",
    trustedOrigins,
    defaultLocale: env.DEFAULT_LOCALE,
    translatorFor: (locale) => createRequestTranslator(localeConfig, locale),
  };

  let closing: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    closing ??= (async () => {
      await mail.close();
      await cache.close();
      await posDb.close();
      await logger.flush();
    })();
    return closing;
  };

  return {
    env,
    pool: posDb.pool,
    db: posDb.db,
    auth,
    cache,
    kv,
    mail,
    logger,
    analytics,
    trpc: { deps, createContext: (req) => createTRPCContext(req, deps) },
    shutdown,
  };
}
```

### 12.20 `packages/backend/scripts/db-migrate.ts` / `db-seed.ts`

Adopted from the docker researcher's verified scripts (plain `node`, Node ≥24.12 type
stripping, `.ts` import specifiers, wait-for-db retry, `MIGRATE_DATABASE_URL ??
DATABASE_URL`, always `client.end()` in finally), with one change: they call
`runPosMigrations` (12.11) instead of raw `migrate()` so the advisory lock and bookkeeping
options are exercised in dev too. Invocation:
`node --env-file-if-exists=../../.env scripts/db-migrate.ts`.

### 12.21 apps/example wiring _(scaffold — mirrored in CLI templates)_

```ts
// lib/pos.server.ts
import "server-only";
import { createNukesPos, type NukesPos } from "@nukesai-pos/backend/bootstrap";
import { attachDatabasePool, waitUntil } from "@vercel/functions";

const g = globalThis as typeof globalThis & { __nukesPos?: Promise<NukesPos> };

export function getPos(): Promise<NukesPos> {
  // next dev re-evaluates modules per save; without this cache each reload leaks a Pool.
  g.__nukesPos ??= createNukesPos({
    env: process.env, // the ONLY process.env handoff
    onPoolCreated: process.env.VERCEL === "1" ? attachDatabasePool : undefined,
    waitUntil: process.env.VERCEL === "1" ? waitUntil : undefined,
  });
  return g.__nukesPos;
}
```

```ts
// server/trpc.ts — consumer-owned tRPC root (R1/R16)
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import {
  posErrorFormatter,
  type PosTrpcContext,
  type PosTrpcMeta,
} from "@nukesai-pos/backend/trpc";

export const t = initTRPC.context<PosTrpcContext>().meta<PosTrpcMeta>().create({
  transformer: superjson, // trpc-to-openapi ignores it: OpenAPI stays plain JSON (verified)
  errorFormatter: posErrorFormatter,
});
```

```ts
// server/routers/_app.ts — binds backend services + middleware factories
import { z } from "zod";
import {
  createAuthGuard,
  createBranchGuard,
  createCacheEffects,
  createRateLimit,
  createValidation422,
} from "@nukesai-pos/backend/trpc";
import { healthCheck, healthOutput } from "@nukesai-pos/backend/trpc"; // services re-exported
import { t } from "../trpc";

const base = t.procedure.use(createValidation422()).use(createCacheEffects());
export const publicProcedure = base;
export const protectedProcedure = base.use(createAuthGuard());
export const branchProcedure = base.use(createBranchGuard());

export const appRouter = t.router({
  health: t.router({
    check: publicProcedure
      .meta({ openapi: { method: "GET", path: "/health", tags: ["system"] } })
      .input(z.object({ echo: z.string().optional() })) // GET inputs: flat primitives only
      .output(healthOutput) // .output() REQUIRED for OpenAPI
      .query(({ input }) => healthCheck(input)),
  }),
  // orders/tables/... routers bind @nukesai-pos/backend service functions the same way
});
export type AppRouter = typeof appRouter;
```

Route files (each `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`):

```ts
// app/api/trpc/[trpc]/route.ts
import { createTrpcHandlers } from "@nukesai-pos/backend/next";
import { getPos } from "../../../../lib/pos.server";
import { appRouter } from "../../../../server/routers/_app";
const pos = await getPos();
export const { GET, POST } = createTrpcHandlers(appRouter, {
  createContext: pos.trpc.createContext,
  trustedOrigins: pos.trpc.deps.trustedOrigins,
  maxBodyBytes: pos.env.API_MAX_BODY_BYTES,
  restBaseUrl: `${pos.env.BETTER_AUTH_URL}/api/rest`,
  onError: (e) => pos.logger.error("trpc.error", e),
});
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

`app/api/rest/[...rest]/route.ts` → `createOpenApiHandlers(appRouter, cfg)` (all five
methods); `app/api/openapi.json/route.ts` → `createOpenApiJsonHandler(appRouter, cfg)`;
`app/api/docs/route.ts` → `createDocsHandler(cfg)`;
`app/api/auth/[...all]/route.ts` → `createAuthRouteHandlers(pos.auth)`.

```ts
// instrumentation.ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerGlobalErrorHandlers } = await import("@nukesai-pos/backend");
    const { getPos } = await import("./lib/pos.server");
    const pos = await getPos();
    registerGlobalErrorHandlers({ logger: pos.logger, runtime: pos.env.BACKEND_RUNTIME });
  }
}
```

`next.config.ts`: unchanged (`serverExternalPackages: ["@nukesai-pos/backend"]` already
present; pg/pino are in Next's built-in default externals — R10).

### 12.22 Common observability/errors, pino adapter, global handlers, frontend i18n

Adopted verbatim from the observability and i18n researchers' compile/runtime-verified
snippets (they already carry the isolatedDeclarations-mandated explicit forms):
`packages/common/src/observability/logger.ts`, `analytics.ts`,
`packages/common/src/errors/codes.ts`, `app-error.ts`,
`packages/backend/src/adapters/logging/pino.ts`,
`packages/backend/src/internal/global-error-handlers.ts`,
`packages/backend/src/internal/trpc/error-mapping.ts`,
`packages/backend/src/i18n/resolve-locale.ts`,
`packages/frontend/src/i18n/index.ts`, `src/locales/en.ts` (+ `ne.ts`),
`src/server/i18n.ts`, `src/client/i18n.tsx`, `src/client/logging/http-logger.ts`,
`src/client/auth/auth-client.ts` (permissions import corrected to
`@nukesai-pos/common/auth` + local `client/auth/roles.ts` derivation — R8).

### 12.23 Root `package.json` script additions

```jsonc
{
  "stack:up": "docker compose -f docker/compose.yaml --env-file .env up -d --wait",
  "stack:down": "docker compose -f docker/compose.yaml down",
  "stack:nuke": "docker compose -f docker/compose.yaml down -v",
  "db:generate": "pnpm --filter @nukesai-pos/backend db:generate",
  "db:migrate": "pnpm --filter @nukesai-pos/backend db:migrate",
  "db:seed": "pnpm --filter @nukesai-pos/backend db:seed",
  "dev:full": "pnpm stack:up && pnpm db:migrate && pnpm db:seed && turbo run dev",
  "test:integration": "vitest run -c vitest.integration.config.ts",
}
```

`packages/backend` scripts: `"db:generate": "drizzle-kit generate"`,
`"db:custom": "drizzle-kit generate --custom"`, `"db:check": "drizzle-kit check"`,
`"db:migrate": "node --env-file-if-exists=../../.env scripts/db-migrate.ts"`,
`"db:seed": "node --env-file-if-exists=../../.env scripts/db-seed.ts"`.
`turbo.json`: no new tasks needed (db/stack scripts are root-level, uncached by design);
`test:integration` deliberately NOT a turbo task (needs the live stack).

---

## Ordered implementation plan

1. **repo**: catalog additions; docker/ tree; .env.example; root scripts; `stack:up` green.
2. **common**: `./auth` (matrix), `./errors`, `./observability` (+zod dep, size budgets);
   unit tests.
3. **backend foundations**: `env.ts`, ports (`cache`, `kv`, `mail`), adapters
   (memory/redis/upstash cache, nodemailer/noop, pino), `create-cache`, `from-env`,
   `global-error-handlers`; unit tests.
4. **backend db**: `_column-types`, `_policies`, schema tables, drizzle.config,
   migrations 0000+0001, `client.ts`/`rls.ts`/`migrate.ts`, scripts; run real build
   (risk #2) + integration RLS suite.
5. **backend auth**: `roles.ts`, `auth/index.ts`, secondary-storage, `next/auth-handlers`,
   auth schema commit + CI drift check.
6. **backend api**: `trpc/init`, `middleware`, `services/health` (+first domain services),
   `error-mapping`, `next/handlers`; verify risk #1 (composition) in the same commit as the
   apps/example scaffold.
7. **apps/example wiring** + frontend `trpc-provider`, `auth-client`, i18n subpaths; dist
   boundary tests; size budgets.
8. **integration config + E2E additions**; doctor checks in CLI (pool math, single
   react-i18next, stack:nuke note).
