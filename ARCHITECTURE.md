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
nukes-pos init      scaffold everything above (+ deps, .env.example,
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

The docs page is unauthenticated and loads its renderer from a third-party CDN
into the app's own origin, so publishing it in production is an explicit
decision (`surfaces: { docs: true }`, ideally with a pinned `docs.cdn`). The
`/auth/*` branch is the only surface reachable before a session exists, so the
dispatcher applies the body-size cap there itself — better-auth checks origins
but imposes no limit of its own.

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

## Build and packaging

```
src/**/*.ts(x)  →  tsdown (rolldown)  →  dist/**  →  publint + attw  →  npm (public)
```

Four decisions shape everything downstream:

**`unbundle: true`.** Every module is its own entry, so `dist/` mirrors `src/`
file-for-file. Bundled mode silently DROPS the `"use client"` directive, which
would break every consumer's build in a way no type check catches. This is also
what lets the hand-written exports maps point at stable deep paths.

**dts via oxc, which requires `isolatedDeclarations`.** Type declarations are
generated per file without a type-checker, so every exported symbol needs an
explicit type annotation. This is why the package annotates things that look
inferable — including the tRPC root, the procedure builders and the built
routers. (TypeScript 7 has no `tsc`-based dts alternative here; see
`.nukes/RESEARCH.md`.)

**Hand-written `exports` maps.** No wildcard auto-export. A new public entry
point is a deliberate act with three companions: a size-limit budget, tests,
and a changeset. `publint` and `attw` run inside `pnpm build`, so a malformed
map or a types/runtime mismatch fails the build, not the consumer.

**Fixed-version changesets.** All four packages version together
(`.changeset/config.json` → `fixed`), so a consumer can never end up with a
frontend that expects a backend it does not have. `release.yml` re-runs the
quality gates, then either opens the version PR or publishes with
`--access public`. Consumers need no registry credentials, which is why the
CLI scaffolds no `.npmrc`.

## The gate system

Every gate below runs in CI (`.github/workflows/ci.yml`) and can be run
locally with the same command. They are not advisory.

| Gate                  | Command                 | Protects                                                        | Configured in                                 |
| --------------------- | ----------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Formatting            | `pnpm format:check`     | reviewable diffs                                                | `.prettierrc` + lint-staged                   |
| Catalog policy        | `pnpm syncpack:lint`    | one version per dependency, repo-wide                           | `.syncpackrc` + `pnpm-workspace.yaml` catalog |
| Lint + boundary zones | `pnpm lint`             | layering, server/client zones, the i18n framework ban           | `packages/eslint-config/`                     |
| Types                 | `pnpm check-types`      | TS7 (`tsgo`) correctness, `isolatedDeclarations`                | `packages/typescript-config/`                 |
| Build                 | `pnpm build`            | dts emit, `"use client"` preservation, publint + attw packaging | each `tsdown.config.ts`                       |
| Unit tests + coverage | `pnpm test`             | behavior, and 100% per-file coverage                            | `vitest.config.ts`                            |
| Coverage canary       | `pnpm coverage:canary`  | that the coverage gate can actually fail                        | `scripts/assert-coverage-gate-fails.mjs`      |
| Size budgets          | `pnpm size`             | per-subpath gzip cost and tree-shaking                          | `.size-limit.json` (12 entries)               |
| Dead code             | `pnpm knip`             | unused files, deps and exports                                  | `knip.json`                                   |
| End-to-end            | `E2E_STACK=1 pnpm e2e`  | the real production build against the real stack                | `playwright.config.ts`                        |
| Live integration      | `pnpm test:integration` | RLS contracts against Postgres (opt-in)                         | `vitest.integration.config.ts`                |

Two of these deserve explanation because they look like over-engineering and
are not:

**The 100% coverage gate is honest by construction.** `coverage.include` is an
explicit glob (`packages/*/src/**`), so a file with no test at all is counted
rather than invisible, thresholds are `perFile`, and the canary proves in CI
that an untested line really does fail the build. Never widen `coverage.exclude`
to make a number go green — write the test.

**The dist boundary test is the real isolation gate.** `pnpm build` runs before
tests because `packages/frontend/test/boundary.dist.test.ts` inspects the built
output: it derives the set of `"use client"` leaves from the SOURCES and asserts
each survived bundling, that no barrel carries the directive, and that no client
chunk imports `server-only` or a node builtin.

## Extension recipes

These are the paths a change actually takes through this repo. Follow the
existing implementation named in each recipe as the template — it is the
reference implementation, not an example.

### Add a backend feature (the `orders` template)

1. **Schema + RLS** — `packages/backend/src/adapters/drizzle/schema/<entity>.ts`:
   table with the branch column, the four `branchGuard()` policies, and a
   branch-leading index. Export it from `schema/index.ts`.
2. **Migration** — `pnpm db:generate`, review the SQL, `pnpm db:migrate`.
3. **Service** — `packages/backend/src/trpc/services/<entity>.ts`: pure logic
   over ports. Every zod schema is annotated `z.ZodType<Output, Input>` (the
   single-parameter form silently widens client inputs to `unknown`) and every
   input/output interface is exported so the router can name it.
4. **Router** — add to `packages/backend/src/trpc/routers.ts`: a
   `TRPCBuiltRouter<PosRootTypes, {...}>` type annotation plus the built router.
   Mutations declare `meta.cacheInvalidates`. Compose it into `posCoreRouter`.
5. **Tests** — caller-based tests in `routers.test.ts` covering success, the
   guard failures, and the cache-discipline canary. Coverage must stay at 100%.
6. **CLI registry** — add the feature to `POS_FEATURES` in
   `packages/cli/src/templates/plan.ts` so `nukes-pos add <name>` can wire it.
7. **Changeset** — `pnpm changeset` (fixed version group; one per user-visible
   change).

Consumers get the new router by bumping the package version. They map nothing.

### Add a translated string

1. Add the FLAT dotted key to `packages/common/src/i18n/locales/en.ts` and
   `ne.ts` (both, or the type gate fails). Single-brace `{name}` placeholders.
2. Use it: backend `ctx.t("your.key")`, RSC
   `getTranslations({ locale, namespace: "pos" })`, client
   `useTranslations("pos")`. Nothing else to register — the nested tree and the
   consumer-facing types derive from the catalog.

### Add a UI surface

- **RSC**: `packages/frontend/src/server/<name>.tsx`, exported from the server
  barrel. It may import backend types; it may not import a client leaf's
  internals.
- **Client leaf**: `"use client"` on the LEAF file, never on a barrel; export
  it from `packages/frontend/src/client/index.ts`.
- A leaf that both graphs need lives in the NEUTRAL `src/i18n/` zone —
  `provider.tsx` is the precedent, and `test/boundary.dist.test.ts` derives the
  guarded leaf set from the sources, so a new one is covered automatically.

### Add a public export

The exports map is hand-written on purpose. All four steps or none:

1. subpath in the package's `exports` map (and the barrel it points at),
2. an entry in `.size-limit.json` with a budget,
3. tests keeping per-file coverage at 100%,
4. a changeset.

### Change a consumer-facing scaffold file

Consumer templates are GENERATED from `apps/example`. Edit the example, run
`node scripts/sync-cli-templates.mjs`, and commit both — `templates.test.ts`
fails on byte drift. The example app IS the CLI's output.

## Invariants worth knowing before you change anything

These are the ones that fail silently — the code compiles, the tests pass, and
something is quietly wrong. Each is enforced somewhere; the enforcement is
named so you can find it.

| Invariant                                                                                       | Why it bites                                                                                                                                                                                                                                                                            | Enforced by                                                                                |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| zod schemas are `z.ZodType<Output, Input>` — **both** parameters                                | the single-parameter form leaves `Input` as `unknown` and silently widens every tRPC client input                                                                                                                                                                                       | compile contract in `backend/src/trpc/routers.test.ts`                                     |
| `PosErrorShape.code` stays tRPC's literal union                                                 | widening to `number` fails tRPC's constraint and the client silently falls back to `DefaultErrorShape`, losing `zod`/`appCode`/`requestId`                                                                                                                                              | same contract                                                                              |
| cache invalidation middleware sits AFTER the branch guard                                       | it reads the branch the guard attaches; earlier means invalidation silently never runs                                                                                                                                                                                                  | `trpc/root.ts` ordering + the canary test                                                  |
| every mutation declares `meta.cacheInvalidates`                                                 | a missed invalidation serves stale data forever                                                                                                                                                                                                                                         | `enforceCacheMeta` throws on the packaged root                                             |
| an `onError` reporter never throws                                                              | use-intl calls it from inside its own catch and then returns a fallback, so throwing turns a degraded string into a 500                                                                                                                                                                 | `i18n/fallback.ts` + its tests                                                             |
| the locale cascade stays lazy, and `PosIntl` gets the locale in routed apps                     | any header read opts the whole page tree out of static rendering                                                                                                                                                                                                                        | `server/i18n.ts` suppliers; `intl.tsx` primes the request cache                            |
| message trees are built with `Object.hasOwn` + `defineProperty`                                 | catalogs arrive as vendor JSON where `__proto__` is an ordinary key                                                                                                                                                                                                                     | `i18n/safe-object.ts`                                                                      |
| `"use client"` never on a barrel; `unbundle: true` never off                                    | the directive is silently dropped and every consumer's build breaks                                                                                                                                                                                                                     | `boundary.dist.test.ts` in both packages                                                   |
| ambient `process.env` only in `bootstrap/singleton.ts`                                          | env drift between modules is invisible until production                                                                                                                                                                                                                                 | lint zone + review                                                                         |
| ESLint blocks must MERGE `no-restricted-imports` AND `no-restricted-syntax`, never restate them | flat config replaces rule options wholesale, so a later block silently deletes an earlier ban and nothing fails. A rule set to severity ALONE (`["error"]`) KEEPS the inherited options — only supplying new options (`["error", {...}]`) replaces them, which is the shape to look for | `scripts/assert-lint-bans.mjs`                                                             |
| the CLI fails loudly, never partially                                                           | it writes into customer repositories                                                                                                                                                                                                                                                    | `init` validates the next.config before writing; `spliceRouters` refuses malformed markers |
| the manifest ledger has one owner per entry                                                     | `init`/`upgrade` own plan paths, `add` owns the extension file; blurring it either blinds `doctor` or pins the old i18n mode forever                                                                                                                                                    | `isExtensionFile` + the ledger tests                                                       |

## Where to look

| Question                                 | File                                                               |
| ---------------------------------------- | ------------------------------------------------------------------ |
| What are the rules?                      | [AGENTS.md](./AGENTS.md)                                           |
| What may import what, exactly?           | [docs/architecture/isolation.md](./docs/architecture/isolation.md) |
| Why is the toolchain this way?           | `.nukes/RESEARCH.md`                                               |
| Why is the backend this way?             | `.nukes/RESEARCH-BACKEND.md`                                       |
| Why is the integration surface this way? | `.nukes/RESEARCH-INTEGRATION.md`                                   |
| What happened in past sessions?          | `.nukes/PROGRESS.md`                                               |
| How do I consume this as an app?         | [README.md](./README.md)                                           |
