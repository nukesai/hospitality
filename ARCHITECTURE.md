# ARCHITECTURE.md

How this repository is put together, what each part is responsible for, and the
path a change takes through it.

- **Rules** live in [AGENTS.md](./AGENTS.md) — that file is binding; this one
  explains the shape those rules protect.
- **The SSR/CSR boundary** is specified in
  [docs/architecture/isolation.md](./docs/architecture/isolation.md) (normative).
- **Why** any given decision was made is recorded in `.nukes/RESEARCH*.md`.

## The mental model

This repo is a **package factory, not an application.** It produces four
published npm packages that a customer's own Next.js 16 application installs.
`apps/example` is not the product — it is the CLI's output, kept in the repo so
the scaffold is executable, buildable and end-to-end tested on every commit.

The organising principle: **the packages own the integration; the consumer app
owns almost nothing.** A finished consumer app contains two route files and two
one-line i18n files. Everything else — routers, providers, middleware wiring,
API surfaces, admin UI — arrives from the packages and updates with a version
bump. If a change would force consumers to edit files they did not write, it
belongs in a package instead.

Second principle: **flat database, per-branch isolation, not multi-tenant.**
One deployment serves one business's locations. Isolation is enforced in
Postgres by row-level security, not by application code alone.

## The four packages

```
@nukesai-pos/common      isomorphic leaf     no siblings, no runtime pin, no env, no DOM
        ↑           ↑
@nukesai-pos/backend    @nukesai-pos/frontend
   server-only            RSC + client + neutral surfaces
        ↑                       ↑
        └──── @nukesai-pos/cli ─┘   (writes files that import them; imports neither)
```

The arrows are the only permitted direction and they are lint-enforced
(`packages/eslint-config/boundaries.js`). Nothing imports `cli`; `cli` imports
no workspace package at runtime — it _emits_ code that does.

| Package    | Owns                                                                                                                                                                        | Must never                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common`   | permission matrix, error registry, branded domain types, API path layout, message catalogs, the dependency-free translator, observability port interfaces, money formatting | import a sibling, `server-only`/`client-only`, a Node builtin, an i18n framework, `process.env`, or a DOM global                                                                 |
| `backend`  | env parsing, bootstrap, Drizzle + RLS, better-auth, cache/KV, the entire tRPC stack, the Next route dispatcher                                                              | import React/`@nukesai-pos/frontend`/client code, read ambient `process.env` outside `bootstrap/singleton.ts`, or reach for an adapter from business logic                       |
| `frontend` | admin RSCs, client leaves, the whole next-intl layer, the next.config wrapper, the proxy factory                                                                            | let client code import `backend`/`server-only`, let server code touch DOM globals, put `"use client"` on a barrel, or place a source file outside the six sanctioned directories |
| `cli`      | the scaffold plan, file templates, the stamp/marker/manifest protocol, `init`/`add`/`doctor`/`upgrade`                                                                      | write into a dirty worktree, clobber a hand-edited file, drop a ledger entry, or half-install an app                                                                             |

### Why `common` is a leaf

Both siblings and the consumer's own app depend on it, so anything it pulls in
is paid for everywhere. That is why zod — its only runtime dependency — is
quarantined behind the `./observability/validation` subpath, and why the root
entry has an 8 kB budget while that subpath has 70 kB.

## Repository map

```
point-of-sale/
├── AGENTS.md                    the rulebook — binding, read it first
├── ARCHITECTURE.md              this file: the shape those rules protect
├── CLAUDE.md                    Claude-specific workflow notes
├── README.md                    consumer quick start + dev commands
├── PRODUCT.md                   product scope (flat DB, per-branch isolation)
├── apps/example/                the CLI's OUTPUT — a real consumer app, built and E2E-tested
├── packages/
│   ├── common/src/
│   │   ├── auth/                permission matrix + can() — the RBAC source of truth
│   │   ├── constants/           posApiPaths(), LocationId branding
│   │   ├── errors/              error-code registry + AppError (toSafeBody is the wire shape)
│   │   ├── i18n/                dependency-free translator
│   │   ├── i18n/locales/        THE catalogs: flat dotted keys, en + ne
│   │   ├── money/               integer-minor-unit formatting
│   │   ├── observability/       Logger/Analytics ports (+ the zod validator, own subpath)
│   │   ├── runtime/             the one environment sniff in the codebase
│   │   ├── schemas/             dependency-free structural validation
│   │   └── types/               branded domain types
│   ├── backend/
│   │   ├── src/env.ts           the ONLY module that interprets env values
│   │   ├── src/bootstrap/       composition root + the getPos() app edge
│   │   ├── src/trpc/            root, procedures, middlewares, guards, built routers
│   │   ├── src/trpc/services/   business logic over ports
│   │   ├── src/ports/           the interfaces business logic depends on
│   │   ├── src/adapters/        drizzle · cache (memory/redis/upstash) · auth · logging · mail · demo
│   │   ├── src/cache/           cache POLICY: single-flight, SWR, invalidation discipline
│   │   ├── src/auth/            better-auth wiring (organization plugin remapped to branch)
│   │   ├── src/next/            createPosApi — the single-mount dispatcher
│   │   ├── src/i18n/            server-side locale negotiation
│   │   ├── migrations/          committed SQL + drizzle journal (shipped in the package)
│   │   └── test-integration/    live RLS contracts (opt-in, outside coverage)
│   ├── frontend/src/
│   │   ├── server/              RSC graph — carries the server-only pill
│   │   ├── client/              browser graph — "use client" on leaves, never barrels
│   │   ├── i18n/                NEUTRAL: routing, nesting, merge, fallback, cascade, provider leaf
│   │   ├── locales/             catalogs derived from common (never hand-written strings)
│   │   ├── next-config/         withNukesPos — build-time, no server-only pill
│   │   └── proxy/               createPosProxy — Node proxy graph, no server-only pill
│   ├── cli/src/
│   │   ├── commands/            init · add · doctor · upgrade (pure of terminal I/O)
│   │   ├── templates/           plan.ts (hand-written) + bodies.ts (GENERATED from apps/example)
│   │   └── utils/               stamp · generated · manifest · git · detect · deps · env · patch
│   ├── eslint-config/           base + react + boundaries (the zone system)
│   └── typescript-config/       base · library · react-library · nextjs presets
├── e2e/                         playwright specs against the production build
├── docker/                      postgres 18 · redis 8 · mailpit, plus the role bootstrap SQL
├── scripts/                     sync-cli-templates · assert-coverage-gate-fails · assert-lint-bans
├── docs/architecture/           isolation.md — the normative SSR/CSR contract
└── .nukes/                      decision records + the cross-session progress log
```

### Directory conventions that carry meaning

- **`index.ts` is a barrel and contains re-exports only.** Coverage excludes
  barrels, so logic there is invisible to the 100% gate.
- **`_`-prefixed files** in the Drizzle schema directory are helpers, not tables.
- **Colocated `*.test.ts`** beside the source; `test/` holds only contracts that
  run against built `dist/`.
- **A file's directory decides what it may import.** In `frontend` that is
  literal: `client/`, `server/`, and four neutral directories are the only legal
  homes, and a file anywhere else is a lint error.

## What a consumer app owns

This is the complete POS-related surface of a scaffolded app. Everything else
lives in the packages and arrives with a version bump.

| File                                           | Lines of real logic | What it does                                                                                      |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `app/api/pos/[[...pos]]/route.ts`              | 2                   | `createPosApi(await getPos(), posCoreRouter)` — auth, tRPC, REST, OpenAPI, docs                   |
| `app/(nukes-pos)/admin/[[...admin]]/page.tsx`  | 1                   | renders `<PosAdminShell>`; sections are routed inside the package                                 |
| `i18n/request.ts`                              | 1                   | `export default createPosRequestConfig()`                                                         |
| `global.d.ts`                                  | —                   | next-intl `AppConfig` augmentation (consumer-owned by necessity: two declarations would conflict) |
| `instrumentation.ts`                           | 1                   | `getPos()` warmup + global error handlers                                                         |
| `next.config.ts`                               | 1                   | wrapped in `withNukesPos()` by the CLI                                                            |
| _(routed mode only)_ `proxy.ts`                | 2                   | `createPosProxy(routing)` + the literal matcher Next requires                                     |
| _(routed mode only)_ `i18n/routing.ts`         | 1                   | `definePosRouting()`                                                                              |
| _(routed mode only)_ `app/[locale]/layout.tsx` | 3                   | locale guard + `<PosIntl>`                                                                        |
| _(optional)_ `server/routers/_app.ts`          | —                   | created by `nukes-pos add` ONLY when the app adds its own procedures                              |

There is deliberately **no** `lib/`, no `server/` by default, no per-router
mapping, and no hand-written types: an app that adds a feature router changes
nothing, because `posCoreRouter` already contains it.

The CLI is what puts these files there:

```
nukes-pos init      scaffold everything above (+ deps, .npmrc, .env.example,
                    next.config wrapper), ledgered in nukes-pos.json
nukes-pos add       create/maintain server/routers/_app.ts for app-local procedures
nukes-pos doctor    read-only diagnosis: stamps, markers, env, version drift
nukes-pos upgrade   regenerate pristine scaffold files after a version bump
                    (hand-edited files are never clobbered — they get a .new sibling)
```

Every scaffolded file carries a sha256 stamp, so `upgrade` can tell "pristine,
safe to rewrite" from "the customer edited this". The router composition file is
managed through marker comments rather than regeneration, so the app's own
procedures survive every upgrade.

## Runtime architecture

### One mount, five surfaces

Every HTTP surface the POS exposes is served by a single Next.js catch-all
route in the consumer app:

```
app/api/pos/[[...pos]]/route.ts
  └─ createPosApi(pos, posCoreRouter, options)      packages/backend/src/next/create-pos-api.ts
       ├─ {base}/auth/**        better-auth handler (all methods)
       ├─ {base}/trpc/**        tRPC fetch adapter
       ├─ {base}/rest/**        trpc-to-openapi REST projection
       ├─ {base}/openapi.json   OpenAPI 3.1 document
       ├─ {base}/docs           Scalar reference UI
       └─ {base}                index JSON describing the surfaces
```

`{base}` is `POS_API_BASE_PATH` (default `/api/pos`), parsed once by
`posApiPaths()` in `@nukesai-pos/common/constants` so the server, the browser
client, better-auth's `basePath`, and the OpenAPI server URL can never drift
apart. A request that reaches the dispatcher on a path it does not own gets a
404 carrying an `x-pos-api` marker header — the signal that the route file is
mounted somewhere the base path does not expect.

### Request lifecycle (tRPC)

```
Request
  → createTRPCContext            trpc/init.ts     session, branch header, requestId,
                                                  logger child, Accept-Language → translator
  → publicProcedure              trpc/root.ts     validation422 → cacheMeta
  → protectedProcedure                            + sessionGuard          (401)
  → branchProcedure(check)                        + rateLimit
                                                  + branchGuard           (403 / RLS ctx)
                                                  + cacheInvalidation     (after the guard)
  → service                      trpc/services/*  pure logic over ports
  → withBranchContext            adapters/drizzle/rls.ts   sets the RLS GUCs per transaction
  → Postgres                     policies enforce branch isolation independently
  → posErrorFormatter            trpc/init.ts     safe message, zod, appCode, requestId
```

The middleware ORDER is load-bearing: cache invalidation must sit after the
branch guard because it reads the branch from the context the guard attaches.

### Data layer

Ports (`packages/backend/src/ports/`) declare the contracts; adapters
(`packages/backend/src/adapters/`) implement them. Domain services depend on
ports only, so a driver swap is an adapter change, never a service rewrite.
Row-level security is the real boundary: every branch-scoped table carries the
four `branchGuard()` policies, migrations run as `pos_owner`, runtime runs as
`pos_app`, and repository queries ALSO filter `branchId` explicitly.

### Localization

One catalog, one namespace, two rendering graphs:

```
packages/common/src/i18n/locales/{en,ne}.ts     FLAT dotted keys — the SSOT
  ├─ backend: dependency-free translator (no i18n framework may enter common/backend)
  └─ frontend: nestPosMessages() → nested tree under the `pos` namespace
       ├─ server:  createPosRequestConfig()  → next-intl request config (lazy cascade)
       └─ client:  PosIntl → NextIntlClientProvider → PosIntlProvider ("use client" leaf)
```

Locale cascade, each source consulted only while the cascade is undecided:
explicit (`getTranslations({locale})`) → `resolveLocale()` → the `[locale]`
segment → cookie → default. Two consumer modes: cookie-negotiated (default, no
URL changes) and locale-prefixed (`--i18n-routing`: `proxy.ts` + `[locale]`).

### Process lifecycle

`getPos()` (`packages/backend/src/bootstrap/singleton.ts`) is the app edge: the
one module allowed to read ambient `process.env`, cached on `globalThis` so
`next dev` reloads cannot leak pools, auto-wiring `@vercel/functions` when it is
installed, and evicting a rejected boot so a transient outage cannot poison the
process. Everything else receives env as a parameter.

### The server/client boundary

`docs/architecture/isolation.md` is normative; the shape is:

```
backend            server-only pill + a `browser` export condition that THROWS
frontend/server    server-only pill; may import backend types
frontend/i18n      NEUTRAL — importable from either graph (the provider leaf lives here
                   because the server composition needs it)
frontend/client    "use client" on the LEAF, never on a barrel
common             provably isomorphic: no env, no DOM, no Node builtins
```

Three mechanisms enforce it, and only the third is a real gate: lint zones catch
it while you type, the `browser` condition catches it at bundle time, and
`test/boundary.dist.test.ts` in both packages inspects the BUILT output — that
every `"use client"` source keeps its directive, that no barrel carries one, and
that no client chunk imports `server-only` or a node builtin.

### Public API surface

Every package's `exports` map is hand-written and reviewed; `tsdown` runs with
`exports: false` and CI asserts no build rewrote a `package.json`.

| Package    | Subpaths                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common`   | `.` · `./auth` · `./errors` · `./observability` · `./observability/validation` · `./types` · `./constants` · `./schemas` · `./i18n` · `./i18n/locales/*` · `./runtime`                               |
| `backend`  | `.` · `./env` · `./bootstrap` · `./trpc` · `./next` · `./cache` · `./auth` · `./ports` · `./adapters/demo` · `./adapters/drizzle` · `./adapters/cache-{redis,upstash,memory}` · `./adapters/logging` |
| `frontend` | `./server` · `./client` · `./i18n` · `./locales/*` · `./next-config` · `./proxy` · `./styles.css` (deliberately **no** root export)                                                                  |
| `cli`      | none — it is a `bin`, not a library                                                                                                                                                                  |

The three primary consumer entries are `backend/bootstrap` (`getPos`),
`backend/next` (`createPosApi`), and `backend/trpc` (`posCoreRouter` and the
procedure ladder), plus `frontend/server` for the UI.
