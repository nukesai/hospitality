---
"@nukesai-pos/backend": minor
"@nukesai-pos/frontend": minor
"@nukesai-pos/cli": minor
---

Hardening pass over the integration surface (adversarial review of the branch):

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
