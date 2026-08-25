# AGENTS.md — Rules of this repository

Canonical guide for every agent (and human) working in this repo. `CLAUDE.md`
points here. If a rule below conflicts with your instincts, the rule wins; if a
rule is not enforced by a machine yet, propose the enforcement in the same PR.

## 1. What this repo is

A **package factory** (pnpm + turborepo). It publishes public
npm packages under `@nukesai-pos/*` that add a POS backend (API) and admin
panel to any existing Next.js 16 app via `npx @nukesai-pos/cli init`.
It is NOT an application; `apps/example` exists only as the E2E target and
consumer fixture.

Product scope: restaurant/bar/hotel POS. **Flat database, per-location
(branch) isolation — every port method takes `locationId` first. NOT
multi-tenant SaaS.** Feature inspiration: PRODUCT.md.

## 2. Architecture — the non-negotiables

> [ARCHITECTURE.md](./ARCHITECTURE.md) is the map: package roles, directory
> layout, request lifecycle, extension recipes. This section is the LAW. When
> the two disagree, this file wins and ARCHITECTURE.md is the bug.

### Layering (lint-enforced)

```
common  ←  backend       backend may import common
common  ←  frontend      frontend may import common
NOTHING ELSE
```

- `frontend` ✗→ `backend`, `backend` ✗→ `frontend` (no react peer in backend —
  UI imports fail by construction). Data crosses the boundary only as
  serializable props / route handlers in the consumer app.
- `common` is a leaf: no Node builtins, no DOM globals, no `process.env` —
  config is injected as parameters.
- `cli` imports no workspace package at runtime; the files it scaffolds
  reference them.

### SSR/CSR isolation (docs/architecture/isolation.md is normative)

- Directory convention: `src/server/**` (RSC/Node, poisoned with
  `import "server-only"`) and `src/client/**` (browser). Shared code goes in
  `@nukesai-pos/common`, never in a `shared/` dir.
- `"use client"` on **leaf** files only — NEVER on a barrel/index (lint +
  dist-test enforced). A directive on a barrel leaks every unused export into
  the consumer's client bundle.
- `@nukesai-pos/frontend` has **no root export** — only `./server`, `./client`,
  `./styles.css`.
- `@nukesai-pos/backend` guarded entries carry `import "server-only"` AND a
  `browser` export condition pointing at a throwing guard.
- Custom export conditions are FORBIDDEN (Turbopack silently ignores them).
- `next/dynamic` lives inside `"use client"` modules; never re-export it.

### Ports & adapters (data layer is deferred)

Business logic depends only on interfaces in `packages/backend/src/ports/`.
Drivers live in `src/adapters/<name>/` and surface as new export subpaths.
Never add an ORM/DB dependency to the public API; never import an adapter from
business logic — inject the port.

## 3. Build & packaging rules

- tsdown, ESM-only, `unbundle: true` ALWAYS (it is the only thing that
  preserves `"use client"`), `dts: { generator: "oxc" }`, `exports: false`
  (exports maps are hand-written; a build must never rewrite package.json).
- Every published package: `sideEffects` accurate, `files` allowlist,
  `publishConfig.access: "public"`, `provenance: false` (npm provenance needs a
  PUBLIC source repo; this one is private — revisit if that changes),
  `license: "GPL-3.0-or-later"` (every published package ships the full GPL-3
  text as its own LICENSE file), author Nukes AI & Software Solution.
- Barrels (`index.ts`) contain re-exports ONLY — logic in an index file breaks
  the coverage exclusion contract.
- No TypeScript enums (erasableSyntaxOnly); const object + union type.
- New public surface ⇒ new subpath export + size-limit budget entry.
- Versions live in the pnpm catalog (`pnpm-workspace.yaml`). Never write a bare
  semver in a package.json — syncpack's catalog policy gates CI. The single
  exception: the TS6 alias in `packages/eslint-config` (typescript-eslint
  cannot run on TS7 yet).

## 4. Quality gates (all blocking, all in CI)

| Gate      | Command                | Contract                                                                                                                                |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Types     | `pnpm check-types`     | TS 7 `tsc --noEmit` is the authority                                                                                                    |
| Lint      | `pnpm lint`            | typed rules + boundary zones; zero warnings tolerated                                                                                   |
| Lint bans | `pnpm lint:bans`       | proves the boundary bans survive into the EFFECTIVE config (flat config replaces rule options wholesale, and a deleted ban never fires) |
| Unit      | `pnpm test`            | 100% statements/branches/functions/lines, perFile, root-only coverage                                                                   |
| Canary    | `pnpm coverage:canary` | proves the gate can fail                                                                                                                |
| E2E       | `pnpm e2e`             | production `next start` of apps/example on :3100                                                                                        |
| Size      | `pnpm size`            | per-export gzip budgets = the Lighthouse guard; raising a budget requires a dedicated reviewed commit                                   |
| Dead code | `pnpm knip`            | no unused files/deps/exports                                                                                                            |
| Format    | `pnpm format:check`    | prettier owns ALL formatting                                                                                                            |

Coverage rules: `coverage` config exists ONLY in the root `vitest.config.ts`
(project-level coverage is silently ignored by Vitest 4). Never lower a
threshold; genuinely unreachable branches use a targeted
`/* v8 ignore ... */` with a justification comment. Tests import `server-only`
via the per-package stub alias; the dist boundary tests assert the real import
ships.

## 5. Git & delivery workflow

- Conventional Commits with a **mandatory scope** from: backend, frontend,
  common, cli, eslint-config, typescript-config, example, repo, ci, deps,
  release. Hooks: pre-commit = lint-staged (prettier), commit-msg = commitlint,
  pre-push = check-types + lint.
- Commit early and often — progress and context live in git history. One
  logical change per commit.
- Every user-visible package change needs a changeset (`pnpm changeset`).
  Versioning is FIXED across the four published packages.
- **Features are delivered through the gstack workflow**: `/spec` to turn
  intent into a precise ticket → implement → `/review` before landing →
  `/ship` to create the PR → `/land-and-deploy` to merge. Do not push to main
  or open PRs by hand when gstack skills are available.
- Never run `syncpack format` (fights prettier-plugin-packagejson). Never use
  `changeset publish` (ships literal `workspace:^`) — release via the root
  `release` script only.

### Release channels

**The branch is the channel. Nothing else selects it.** There is no flag to
remember, no pre mode to enter and exit, and no environment variable to type.

| Branch        | Merging into it publishes           | Version                          | dist-tag | Commits versions    |
| ------------- | ----------------------------------- | -------------------------------- | -------- | ------------------- |
| `development` | a canary, every push                | `0.0.0-canary-<utc14>-<sha7>`    | `canary` | no                  |
| `staging`     | a beta, when the queue is non-empty | `<next>-beta.<utc14>.sha-<sha7>` | `beta`   | no                  |
| `main`        | a GA                                | `<next>`                         | `latest` | **yes — only here** |

Promotion is by merge: `feat/*` → `development` → `staging` → `main`. Each rung
has a standing promotion PR that `promote.yml` opens and keeps refreshed, with
the exact next version and the exact CHANGELOG in its body. Merging it is the
decision; merging `staging` → `main` **is** the release decision, and there is
no second approval.

Only `main` commits version bumps. That is not a detail — it is what keeps
promotion merges conflict-free, because `staging` and `development` never touch
the eight files a release rewrites.

**Merge commits only.** `allow_squash_merge` and `allow_rebase_merge` must stay
off. A squashed promotion leaves the consumed changesets alive on `staging` and
`development`, which republishes shipped release notes and can re-bump a minor.
Verified.

**`.changeset/pre.json` must never exist.** Pre mode cannot advance its `-beta.N`
counter without committed state, and a `pre.json` that reaches `main` publishes
production to the beta tag _even with_ `RELEASE_ALLOW_LATEST=1`. Its presence is
a hard refusal.

**Every changeset names all four published packages.** Versioning is fixed, so a
changeset naming only one still bumps all four — and the others get a bare
`## X.Y.Z` heading with no notes. `pnpm changesets:verify` enforces this.

**A publish is not done until the REGISTRY says so.** `pnpm publish` has printed
`Published` for a package the registry 404s. `scripts/verify-published.mjs` asks
the registry and is the last word.

**Nothing to publish must be a no-op, not a failure.** A docs-only merge reaches
every release workflow with an empty queue and must stay green.

**`publishConfig.tag` is a no-op under pnpm** — pnpm never reads it. The dist-tag
must arrive as an explicit `--tag`, which `scripts/resolve-release-channel.mjs`
computes from the branch.

**Branch protection is not available on this plan** (403 "Upgrade to GitHub
Pro"). Production is locked by four independent keys instead: `ref_name`,
`RELEASE_ALLOW_LATEST` scoped to the `production` environment, a HEAD that must
be a merge commit, and the branch-keyed shape check in the guard. Because the
lock lives in the repo, `pnpm channels:verify` runs on every PR and every
release.

**`changeset status` needs a local `main`.** A clone that only has `development`
makes it exit 1. Use `pnpm changeset:status`, which fetches the ref first.

**Never `git revert -m 1` a promotion merge on `main`.** The back-merge would
silently delete that work from `staging` and `development` — clean merge, nothing
red, and a later `git merge` says "Already up to date." while the code is gone.
Roll forward with a `hotfix/*` instead. Full procedure: [RELEASING.md](./RELEASING.md).

Commands:

```bash
pnpm changesets:verify   # every changeset covers the whole fixed group
pnpm channels:verify     # the channel guard still refuses (20 asserted states)
pnpm changeset:status    # what the next version would be, with a fetched main
```

## 6. Toolchain facts you will trip over

- `typescript@7` is the Go-native compiler. It has no tsserver and no JS API;
  typescript-eslint runs on a TS6 alias scoped inside `packages/eslint-config`.
  Do NOT add a root-level typescript alias or a pnpm override on `typescript`.
- `tsdown` bundled mode silently DROPS `"use client"` — that is why
  `unbundle: true` is mandatory and why `test/boundary.dist.test.ts` exists.
- Vitest 4: `coverage.all` and the `workspace` field are gone; `projects` +
  explicit `coverage.include` are load-bearing.
- Node ≥ 21 ships a global `navigator` — don't assert its absence in server
  environments.
- tsconfig `include` resolves relative to the file that declares it — presets
  in `packages/typescript-config` must not carry `include`.
- The example app's `<h1>Nukes POS</h1>` is a contract with `e2e/smoke.spec.ts`.

## 7. Backend-system rules (phase 2 — binding)

- Decision record: `.nukes/RESEARCH-BACKEND.md` (contradiction resolutions R1–R16 are binding).
- **The consumer owns NOTHING tRPC by default** (R1 resolved 2026-08-21): the
  root (`posTrpc`), procedures, middlewares AND the built feature routers
  (`healthRouter`, `ordersRouter`, `posCoreRouter`) all ship from
  `@nukesai-pos/backend/trpc` with CHECKED cast-free hand annotations over
  tRPC's public generics (TRPCBuiltRouter/TRPCQueryProcedure/...). Client
  inference stays byte-precise ONLY while (a) every zod schema is annotated
  `z.ZodType<Output, Input>` — the single-param form leaves Input=unknown and
  silently widens all client inputs (compile-contract in
  backend/src/trpc/routers.test.ts guards this) — and (b) the router
  annotations stay in sync with their implementations (assignment-checked, no
  casts). The consumer route file consumes `posCoreRouter`; app-local
  procedures use the OPTIONAL extension file `nukes-pos add` scaffolds
  (marker-managed `server/routers/_app.ts`, composed with `posTrpc.router()` on
  the same root instance — namespaced, not merged; `posTrpc.mergeRouters` is
  available for apps that want the flat shape instead).
- **`PosErrorShape.code` stays `TRPC_ERROR_CODE_NUMBER`** — the same class of
  bug as the zod rule above: widening it to `number` fails tRPC's
  `TShape extends TRPCErrorShape` constraint, initTRPC silently falls back to
  `DefaultErrorShape`, and every client loses the typed `error.data`
  (`zod`/`appCode`/`requestId`). Pinned by the compile contract in
  `routers.test.ts`.
- **`getPos()` never caches a failed boot** — a rejected promise is evicted so
  a transient outage cannot poison the process for its lifetime.
- **RLS**: every branch table gets the four `branchGuard()` policies + branch-leading
  index; `withBranchContext` is the only sanctioned context entry; migrations/seeds
  run as `pos_owner`, runtime as `pos_app` (never BYPASSRLS, never FORCE RLS).
  Repository queries ALSO filter `branchId` explicitly (defense in depth).
- **Cache discipline**: every mutation declares `meta.cacheInvalidates` (or "none");
  the invalidate middleware must sit AFTER branchGuard (ctx order bug caught live).
  Reads fail open, invalidation fails closed. Keys/tags are branch-scoped.
- **Env**: only `src/env.ts` interprets env values. Ambient `process.env` is
  read in EXACTLY ONE module: `src/bootstrap/singleton.ts` (`getPos()` — the
  documented app edge; it also auto-wires @vercel/functions when installed).
  Everything else receives env as a parameter; `scripts/**` excepted.
  `POS_API_BASE_PATH` (default `/api/pos`) is the single mount every surface
  and client derives from via `posApiPaths()` in common.
- **i18n**: catalogs live ONCE in `@nukesai-pos/common` — FLAT dotted keys,
  single-brace `{name}` (= ICU simple arguments). Frontend derives NESTED
  next-intl messages from them (`nestPosMessages`, round-trip-tested); the
  `pos` namespace prevents consumer collisions and keeps wire error keys
  (`t(error.message)`) working as relative paths. NO i18n framework ever
  enters common/backend (lint-enforced: i18next, react-i18next, next-intl,
  use-intl) — the server side uses the dependency-free common translator.
  Consumer integration: `i18n/request.ts` one-liner over
  `createPosRequestConfig` (the next-intl plugin demands an app-local relative
  file); `PosIntl` in the root layout; optional routed mode = `proxy.ts` +
  `[locale]` tree (`nukes-pos init --i18n-routing`).
- **The API's docs surfaces are development-only unless asked.** `/docs` is
  unauthenticated and Scalar loads its renderer from a third-party CDN into the
  app's own origin; `openapi.json` publishes the whole contract. Both default
  to `NODE_ENV !== "production"` — publishing them is an explicit
  `surfaces: { docs: true }`, ideally with a pinned `docs.cdn`. `/auth/*` is the
  only pre-session surface, so the dispatcher applies the body cap there itself.
- **`PosIntl` must receive the locale in routed apps.** It primes next-intl's
  request cache; without it every locale-less server API reads request headers
  and the whole page tree drops out of static rendering (measured: `f /[locale]`
  vs `● /en`). Falsy locales take the inherit path — next-intl throws on any
  falsy value and its production build strips the message to `undefined`.
- **An `onError` reporter NEVER throws** — use-intl calls it from inside its
  own catch blocks and then returns a fallback, so a throw converts a degraded
  string into a 500 (and `relativeTime` re-enters `onError`, whose second throw
  escapes the render). MISSING_MESSAGE and ENVIRONMENT_FALLBACK are advisories
  and stay silent; everything else is reported. Consumers configure
  `timeZone`/`now`/`formats`/`onError` through `createPosRequestConfig`.
- **Message trees are built prototype-safely** (`Object.hasOwn` +
  `defineProperty`, see `i18n/safe-object.ts`): catalogs arrive as vendor JSON,
  where `__proto__` is an ordinary own key.
- **The locale cascade is LAZY**: `requestLocale` is a getter and `cookies()` is
  a dynamic API, so each source is read only while the cascade is undecided —
  eager reads opt statically renderable pages into dynamic rendering.
- **`definePosRouting` preserves the literal locale tuple** so the scaffolded
  `AppConfig["Locale"]` augmentation narrows to a union instead of `string`.
- **Stack**: `pnpm stack:up && pnpm db:migrate && pnpm db:seed`; integration suite
  `pnpm test:integration` (live RLS contracts, opt-in); full E2E `E2E_STACK=1 pnpm e2e`.
- zod-openapi stays PINNED at 5.4.6 (6.x breaks trpc-to-openapi peers).
- **CLI templates are generated from apps/example** — edit the example, run
  `node scripts/sync-cli-templates.mjs`; `templates.test.ts` fails on drift.
  The example app IS the CLI's output (routed variant). Scaffolded consumer
  files carry the do-not-edit stamp; `nukes-pos upgrade` rewrites pristine
  files only and drops `.new` next to hand-edited ones.
- **The CLI writes into CUSTOMER repos, so it fails LOUDLY, never partially**:
  `init` validates the next.config shape (dry-run patch) BEFORE writing
  anything and refuses CommonJS / non-wrappable default exports with manual
  instructions; `spliceRouters` requires all four markers exactly once and in
  order (a duplicated or inverted block would emit duplicate imports or delete
  the user's procedures); every mutating command (`init`/`add`/`upgrade`)
  enforces the clean-worktree guard.
- **The manifest ledger is APPEND-ONLY across commands**: `init` and `upgrade`
  union what `add` recorded (the extension file and its features) — dropping an
  entry blinds `doctor` to a file that is still on disk.
- **ESLint blocks MERGE `no-restricted-imports`, never restate it.** Flat
  config replaces rule options wholesale, so a second block targeting the same
  files silently deletes the bans declared before it — and a deleted ban simply
  never fires, so nothing goes red. Use `withI18nFrameworkBan` (or restate every
  pattern) and keep `pnpm lint:bans` green; it asserts the EFFECTIVE config.
- **Registry lookups use `Object.hasOwn`, never `in`.** `in` walks the
  prototype chain, so `nukes-pos add constructor` passed validation and spliced
  `Object: undefined,` into a customer's router file (verified).
- **Scaffolded layouts are NESTED.** The consumer already owns
  `app/layout.tsx`; a template that emits `<html>`/`<body>` (or someone else's
  `<title>`) nests a second document inside theirs.
- **A boot that dies half-built tears itself down.** `getPos()` retries a failed
  boot, so `createNukesPos` must close what it created — otherwise each retry
  strands another `pg.Pool`. Failures are remembered for a cooldown so an
  outage cannot turn every request into a fresh boot.
- **Dependency injection respects EVERY package.json section** — an entry in
  devDependencies/peerDependencies still wins resolution for the consumer.
- **Route templates never export `dynamic`/`runtime` segment configs** —
  handlers are dynamic-by-default and `dynamic` is REMOVED under Cache
  Components (build error for consumers who enable it).

## 8. Where to look

| Question                        | Answer                                                    |
| ------------------------------- | --------------------------------------------------------- |
| Why is the toolchain like this? | `.nukes/RESEARCH.md` (verified decision record)           |
| What may import what?           | §2 above + `packages/eslint-config/boundaries.js`         |
| SSR/CSR mechanics               | `docs/architecture/isolation.md`                          |
| Product feature scope           | `PRODUCT.md`                                              |
| Release mechanics               | `.changeset/config.json`, `.github/workflows/release.yml` |
