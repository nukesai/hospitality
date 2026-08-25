# @nukesai-pos/frontend

## 1.0.0

### Major Changes

- f771ab9: First 1.0 release. Caret ranges now work for scaffolded apps.
  
  **This is why 1.0.0 and not 0.2.0.** The CLI writes `^${cliVersion}` into every
  app it scaffolds. Under semver a caret on a `0.x` version is pinned to that
  minor — `satisfies("0.2.0", "^0.1.0")` is `false` — so every app ever scaffolded
  by the CLI was frozen at its scaffold version and could never receive a release
  without a hand-edit to a file the consumer did not write. That contradicts the
  organising principle of this repo. At `1.x` the caret does what everyone expects:
  `^1.0.0` picks up every later minor and patch.
  
  Two related fixes ship with it:
  
  - The CLI now writes an **exact pin** rather than a caret when it is itself a
    canary. `^0.0.0-canary-<ts>-<sha>` expands to a range that can never resolve a
    stable release and floats onto every future snapshot, so an app scaffolded
    from a canary silently tracked canaries forever. Beta and stable keep the
    caret, which is the point of the channel design — `^1.2.0-beta.<ts>.sha-<sha>`
    graduates a scaffolded app onto the GA and on to the next feature train with
    no edit.
  
  - Release channels are now selected by **branch**, not by a human remembering a
    flag. `development` publishes `@canary`, `staging` publishes `@beta`, and
    `main` publishes `@latest`. Pre mode is gone. For consumers this changes
    nothing about the code, but `@beta` now tracks a real, strictly-increasing
    version instead of a counter that could not advance.
  
  No runtime API changed in this release.

### Minor Changes

- 736d30d: Restore and machine-enforce the two-lock server/client isolation contract.
  
  Six published backend entries were missing a lock. `./adapters/cache-redis` and
  `./adapters/cache-upstash` had neither, while shipping `ioredis` and
  `@upstash/redis`; `./auth`, `./adapters/logging` and `./adapters/cache-memory`
  were missing the `server-only` pill; `./bootstrap` carried it only transitively.
  All six are fixed, and every subpath except the isomorphic-safe
  `./adapters/cache-memory` now resolves to the throwing browser guard —
  `./env` and `./ports` included, which previously carried no lock at all.
  
  **Two behaviour changes, both by design.**
  
  1. Importing `@nukesai-pos/backend/adapters/cache-*`, `/auth`, or
     `/adapters/logging` from a **client component** now fails the build instead of
     pulling a database driver into your browser bundle. That import was never
     supported — the backend package is server-only — but it used to fail quietly
     or not at all. Move it to a server component, route handler, or server action.
  
  2. Those same entries now throw if imported under **plain Node** (a bare
     `vitest` run, a script). This is how `server-only` works: its `default`
     condition is a `throw`, and only the `react-server` condition resolves to a
     no-op. The package's main entry has always behaved this way; the change is
     that five more subpaths now behave consistently with it. If you exercise
     backend code in Node-based tests, alias `server-only` to a stub the way this
     repo does in `packages/backend/vitest.config.ts`. `./env` stays pill-free
     precisely so scripts can import it.
  
  Released as a minor rather than a patch: under fixed 0.x versioning a patch
  reaches every `^0.1.0` consumer automatically, and builds that previously
  succeeded can now fail.
  
  The dist boundary test now derives its entry list from the package's own
  `exports` map instead of a hard-coded pair, and additionally asserts condition
  order (`browser` before `default`, or the guard silently never fires), rejects
  shorthand string exports, and requires `sideEffects` to name every pill-bearing
  entry so a bundler cannot elide the pill.
  
  Branch isolation is a real rule now: an ESLint ban blocks raw `db.transaction`
  and `set_config` — including via `sql.raw()` — outside the sanctioned
  `withBranchContext()`. A frontend barrel bug was fixed in the same pass: the
  per-barrel lint override had been replacing its zone's bans wholesale, so
  `await import("@nukesai-pos/backend")` inside `src/client/index.ts` linted clean.

### Patch Changes

- e7c0e9e: Release pipeline now verifies against the npm registry that a publish actually
  landed.
  
  `pnpm publish` reporting success is not proof of publication: a release run
  printed `✅ Published package @nukesai-pos/cli@…`, exited 0, and the registry
  returns 404 for that version while the other three packages published fine —
  splitting a fixed version group with nothing red. Both publish paths now end in
  a registry check that every package exists at the expected version and that the
  dist-tag resolves to it.
  
  No runtime code changes.
- d128c8e: Default publish channel is now `canary` rather than `latest`.
  
  `publishConfig.tag` moves from `latest` to `canary` on all four published
  packages. This is metadata only — it changes nothing about the code you install
  — but it means a stray `npm publish` can no longer land unfinished packages on
  the production channel.
  
  The real guard is `scripts/resolve-release-channel.mjs`, which derives the npm
  dist-tag from repository state and refuses to publish when no channel has been
  selected. pnpm does not read `publishConfig.tag` at all, so the tag is passed
  explicitly on the publish command.
- Updated dependencies [f771ab9]
- Updated dependencies [e7c0e9e]
- Updated dependencies [736d30d]
- Updated dependencies [d128c8e]
  - @nukesai-pos/common@1.0.0

## 0.1.0

### Minor Changes

- 4a1d9af: Hardening pass over the integration surface (adversarial review of the branch):
  
  - **frontend**: the next-intl error reporter never throws — `ENVIRONMENT_FALLBACK`
    is an advisory use-intl raises from inside its own catch blocks, so rethrowing
    it crashed any render calling `useFormatter().relativeTime()`. Adds
    `timeZone`/`now`/`formats`/`onError` passthrough to `createPosRequestConfig`,
    builds message trees prototype-safely, LAYERS consumer catalogs over the
    shipped ones, reads the locale cascade lazily (no needless dynamic-API access),
    preserves literal locales in `definePosRouting`, fixes the ancestor-inherit
    path of `PosIntlProvider`, wraps function-shaped next.configs correctly, and
    passes POS API requests through the proxy for any `POS_API_BASE_PATH`.
  - **backend**: `PosErrorShape.code` now satisfies tRPC's shape constraint. This
    is a TYPE-level fix with no wire change — `error.data` already carried `zod`,
    `appCode` and `requestId`; what was broken is that clients saw tRPC's default
    shape instead of ours. `PosErrorShape` and `PosErrorData` are narrower now, so
    a consumer-written formatter typed against the old shape needs updating.
    `getPos()` no longer caches a failed boot (it retries after a short cooldown,
    and a boot that dies half-built tears down its pool). The `/docs` and
    `/openapi.json` surfaces now default to development only — they are
    unauthenticated and Scalar loads its renderer from a CDN into the app's
    origin; pass `surfaces: { docs: true }` to publish them. A 500 caused by an
    OUTPUT-schema failure no longer ships the internal DTO shape.
  - **cli**: `nukes-pos add` now materializes the app-local composition file (the
    documented flow was unreachable for every default install), refuses next.config
    shapes it cannot wrap (before writing anything)
    instead of mangling them, keeps the manifest ledger append-only across
    `init`/`add`/`upgrade`, validates all four router markers (count + order),
    makes `nukes-pos add` materialize the app-local composition file, guards
    `upgrade` behind a clean worktree, respects every package.json dependency
    section, and fixes `.env`/`.env.local` precedence in `doctor`.
- 7d27e0d: Consumer boilerplate eliminated: the packages own the integration.
  
  **BREAKING — every API path moved.** All surfaces now mount under one
  catch-all at `POS_API_BASE_PATH` (default `/api/pos`):
  
  | before | after |
  | --- | --- |
  | `/api/auth/*` | `/api/pos/auth/*` |
  | `/api/trpc/*` | `/api/pos/trpc/*` |
  | `/api/rest/*` | `/api/pos/rest/*` |
  | `/api/openapi.json` | `/api/pos/openapi.json` |
  | `/api/docs` | `/api/pos/docs` |
  
  Setting `POS_API_BASE_PATH=/api` reproduces the previous layout exactly.
  better-auth's `basePath` is derived from the same value, so mobile clients,
  callback URLs and bookmarked OpenAPI documents all move together.
  
  **BREAKING — i18next is gone, replaced by next-intl.** Removed from
  `./i18n`: `createPosI18n`, `PosI18nConfig`, `PosResourceBundle`,
  `POS_DEFAULT_NS`, `mergePosResources`. From `./server`: `createPosServerI18n`,
  `PosServerI18n`. From `./client`: `PosI18nProvider` (the i18next shape) and the
  `useTranslation` re-export. From `./locales/*`: `PosLocaleResources`. Two names
  survive with different shapes: `PosIntlProviderProps` (now next-intl's provider
  props) and `PosEnResources` (now a NESTED tree, was flat dotted keys — check any
  `AppConfig["Messages"]` augmentation). Peers change accordingly: `i18next` and
  `react-i18next` out, `next-intl` ^4.13.0 in as a required peer.
  
  Replacements: `createPosRequestConfig` (the one-line `i18n/request.ts`),
  `PosIntl` (one tag in the layout), `withNukesPos` (next.config), `createPosProxy`
  (Next 16 proxy.ts), `PosAdminShell` (the admin route).
  
  **BREAKING — `nukes-pos upgrade` now WRITES.** It was plan-only; it regenerates
  pristine scaffolded files in place (hand-edited files still get a `.new`
  sibling) and refuses a dirty worktree. Pass `--dry-run` for the old behavior.
  
  **BREAKING — `PosTrpcDeps` gained a required `resolveLocale`.** Code that builds
  that object literally (rather than via `createNukesPos`) must supply it.
  
  Also: package-owned tRPC root (`posTrpc`, the procedure ladder, and the built
  `healthRouter`/`ordersRouter`/`posCoreRouter` — consumers map nothing),
  `getPos()`/`disposePos()` singleton, and a full CLI assembler
  (`init`/`add`/`doctor`/`upgrade`) whose templates are byte-generated from
  `apps/example`.
- c0f823e: Publish under **public** npm access, licensed **GPL-3.0-or-later**.
  
  The packages were `UNLICENSED` (proprietary). They now ship the full GPL-3 text
  and declare `"license": "GPL-3.0-or-later"`. Note the copyleft consequence: an
  application that installs `@nukesai-pos/*` and distributes the result is a
  derivative work and must be GPL-licensed too.
  
  For consumers this removes a credential requirement entirely: `nukes-pos init`
  no longer writes an `.npmrc`, so nobody needs an `NPM_TOKEN` in their shell or
  their CI to install `@nukesai-pos/*`. `doctor` no longer checks for one either.
  If you already have an `.npmrc` from a previous scaffold, the auth line is now
  unnecessary — the registry entry is harmless but does nothing.
  
  `publishConfig.access`, the changesets config and the release script all say
  `public`. Provenance stays off: npm attestation requires a public source
  repository and this one is private.

### Patch Changes

- Updated dependencies [7d27e0d]
- Updated dependencies [c0f823e]
  - @nukesai-pos/common@0.1.0
