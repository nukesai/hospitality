# @nukesai-pos/frontend

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
