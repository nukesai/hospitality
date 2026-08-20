# Integration-surface decision record — session 3 (2026-08-21)

Verified decisions behind commits `3d94d93..` (this branch). Full research
reports were produced by a 5-agent workflow (next-intl v4, Next 16 packaging,
repo audits, adversarial critique); load-bearing claims were re-verified live.

## Binding resolutions

1. **Single mount** `POS_API_BASE_PATH` (default `/api/pos`): `posApiPaths()`
   in common is the ONE layout definition; `createPosApi(pos, router)` serves
   auth (better-auth `basePath`, verified 1.7.1 dist), trpc, rest, openapi.json
   and Scalar docs from one optional-catch-all route. Route templates export NO
   `dynamic`/`runtime` (removed under Cache Components; dynamic by default).
2. **z.ZodType MUST carry both generics.** `z.ZodType<T>` (Output only) leaves
   `Input = unknown` (zod4 `ZodType<Output, Input>`), and tRPC's `.input()`
   reads the INPUT side: every client input had silently widened to `unknown`
   since session 2. Compile-contract in `backend/src/trpc/routers.test.ts`.
3. **All tRPC ships from the package** — root, procedures, middlewares AND
   built routers — via checked (cast-free) annotations over public generics:
   `TRPCRootObject`, `TRPCProcedureBuilder` (+`TRPCUnsetMarker` slots),
   `TRPCBuiltRouter` + per-procedure `TRPCQuery/MutationProcedure` defs.
   Three compile-proof rounds: built-router INFERRED exports impossible
   (TS9013); annotated builders/routers possible; end-to-end client precision
   proven from dist by consumer-side probes (now package-side contract).
   errorShape stays `TRPCDefaultErrorShape` at type level (posErrorFormatter's
   shape never inferred — status quo; runtime formatting unaffected).
4. **Consumers compose nothing by default**: route.ts uses `posCoreRouter`;
   `nukes-pos add` materializes the OPTIONAL marker-managed extension file
   (`mergeRouters` on the SAME posTrpc instance — no cross-instance hazards).
5. **i18n = next-intl 4.13.7** (i18next removed): common keeps FLAT dotted
   catalogs (dependency-free translator for backend); frontend nests them
   (dots are next-intl path separators — loss-less transform, collision-
   guarded) under the `pos` namespace; wire error keys keep working as
   relative paths. `createPosRequestConfig` cascade: explicit >
   resolveLocale > [locale] segment (deprecated requestLocale bridge) >
   cookie > default. `PosIntl` one-tag provider: the OUTER zero-prop
   NextIntlClientProvider must render from a Server Component; the INNER
   "use client" leaf re-declares onError/getMessageFallback (not serializable,
   not inherited) and reads the ancestor locale via useLocale() — next-intl's
   client provider hard-requires `locale` BEFORE context merge (verified in
   compiled dist). Plugin demands an app-local RELATIVE request-config file —
   the one-liner consumer file is packaging-mandatory, not a choice.
6. **withNukesPos** (frontend/next-config, NO server-only pill — next.config
   loads without the react-server condition) wraps serverExternalPackages +
   createNextIntlPlugin; **createPosProxy** (frontend/proxy) wraps next-intl
   middleware for Next 16 `proxy.ts` (matcher stays a literal in the consumer
   file — Next statically analyzes it).
7. **getPos()/disposePos()** singleton (backend/bootstrap) is THE one
   sanctioned ambient `process.env` read; auto-wires @vercel/functions
   (optional peer) under VERCEL=1; globalThis-cached against dev re-evals.
8. **CLI templates are generated from apps/example**
   (`scripts/sync-cli-templates.mjs`; templates.test.ts enforces byte-sync).
   Cookie-mode scaffold by default (non-invasive); `--i18n-routing` opt-in
   materializes proxy.ts + [locale] tree. Stamped files; pristine-only
   rewrites; hand-edits get `.new` siblings; marker-spliced extension.

## Known deferred items

- Static rendering of routed pages via next/root-params (requestLocale bridge
  keeps pages dynamic; revisit when next-intl's successor API settles).
- OPTIONS/CORS preflight surface on the dispatcher (same-origin + bearer today).
- posErrorFormatter type-level shape (Default at type level, POS shape at runtime).
- Catalog lints (no apostrophes / no ICU plural in common values) live as tests;
  extend when plural-bearing strings first land (frontend-only catalogs then).
