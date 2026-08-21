---
"@nukesai-pos/backend": minor
"@nukesai-pos/common": minor
"@nukesai-pos/frontend": minor
"@nukesai-pos/cli": minor
---

Consumer boilerplate eliminated: the packages own the integration.

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
