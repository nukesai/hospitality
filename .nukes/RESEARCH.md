# @nukesai-pos Foundation — Decision Record

> Principal-architect synthesis of 6 verified research streams. Everything here is implementation-ready and internally consistent: script names ↔ turbo tasks ↔ CI steps ↔ husky hooks all match. Where researchers contradicted each other, the resolution is stated inline and marked **RESOLVED**. Corrections from adversarial verification have been applied silently.
>
> Date: 2026-08-20 · Machine: node v24.18.0, pnpm 11.10.0 (live-verified; a researcher's claim of pnpm 11.22.0 was refuted by re-running `pnpm --version`).

---

## 1. Toolchain matrix

| Tool | Pinned version | Role | Status |
|---|---|---|---|
| node | 24.18.0 (engines `>=24.18.0` at root) | Dev/CI runtime. Published packages declare `>=20.19.0` (consumer floor = Next 16's `>=20.9` + ESLint/tooling floor) | ✅ |
| pnpm | 11.10.0 (`packageManager: pnpm@11.10.0`) | Package manager; catalogs are the version single-source-of-truth; `workspace:` protocol rewritten at publish | ✅ |
| typescript | 7.0.2 (Go-native `tsc`) | Type-checking (`check-types`), `next build` type checks (Next spawns local `tsc`, `useTypeScriptCli` defaults true) | ✅ with caveats below |
| @typescript/typescript6 | 6.0.2 (TS 6.0.3 internally, bin `tsc6`) | **Scoped alias inside `packages/eslint-config` only** — gives typescript-eslint the JS API it needs | ✅ |
| next | 16.3.1 | Consumer framework + in-repo example app for E2E | ✅ |
| react / react-dom | 19.2.8 (peer range `^19.2.0`) | UI runtime, peer-only in published packages | ✅ |
| tsdown | 0.22.14 | Package builds (rolldown ~1.2, rolldown-plugin-dts 0.27.x) | ✅ |
| dts generator | **oxc** (forced via `isolatedDeclarations: true` + `dts: { generator: "oxc" }`) | Declaration emit, TS-package-independent | ✅ |
| eslint | 10.8.1 flat config | Linting | ✅ |
| typescript-eslint | 8.67.0 | Type-aware lint (runs on the TS6 alias) | ⚠️ see below |
| @eslint/js | 10.0.1 | Core recommended rules | ✅ |
| eslint-plugin-import-x | 4.17.1 | Boundary zones (`no-restricted-paths`) — only import plugin declaring ESLint 10 support | ✅ |
| eslint-import-resolver-typescript | 4.4.5 | **Required** resolver; without it zone rules silently no-op on `.js`-suffixed TS specifiers | ✅ |
| eslint-plugin-react-hooks | 7.1.1 | Hooks + bundled React Compiler rules (`configs.flat.recommended`) | ✅ |
| @next/eslint-plugin-next | 16.3.1 | Next rules (flat `configs['core-web-vitals']`); ships NO boundary rules → we hand-build them | ✅ |
| eslint-config-prettier | 10.1.8 (`/flat` subpath) | Kills all formatting rules, last in every config | ✅ |
| eslint-plugin-turbo | 2.10.11 (`configs['flat/recommended']`) | Undeclared-env-var lint | ✅ |
| globals | 17.11.0 | Env globals for flat config | ✅ |
| prettier | 3.9.6 + prettier-plugin-packagejson 3.0.2 | Sole formatter (ESLint owns zero formatting) | ✅ |
| vitest | 4.1.11 + @vitest/coverage-v8 4.1.11 | Unit tests; **coverage is root-only**, `include` is mandatory (`all` was removed) | ✅ |
| @testing-library/react / dom / jest-dom | 16.3.2 / 10.4.1 / 7.0.1 | Component tests (`globals: false` ⇒ manual `cleanup()` in setup) | ✅ |
| jsdom / @vitejs/plugin-react | 30.0.1 / 6.1.0 | Frontend test environment | ✅ |
| @playwright/test | 1.62.1 | E2E against the example app (prod `next start`, port 3100) | ✅ |
| size-limit + @size-limit/preset-small-lib | 13.0.3 | **Blocking** perf/tree-shaking gate (per-export `import` budgets, `gzip: true`) | ✅ |
| turbo | 2.10.11 | Task graph + `.turbo/cache` via actions/cache@v6 (no remote cache service) | ✅ |
| husky / lint-staged | 9.1.7 / 17.3.0 | Hooks (v9 format: no shebang, no husky.sh preamble) | ✅ |
| @commitlint/cli + config-conventional | 21.2.2 | Conventional commits + forced scopes | ✅ |
| @changesets/cli | 3.0.1, `changesets/action@v2.1.1` (v2 kebab-case inputs) | Versioning/release; **fixed** group of the 4 published packages | ✅ |
| publint / @arethetypeswrong/core | 0.3.24 / 0.18.5 | Publish-readiness, run **inside** tsdown builds (`publint: true`, `attw: { profile: "esm-only", level: "error" }`) | ✅ |
| knip | 6.32.2 | Dead code/deps/exports (tree-shakability drift detector) | ✅ |
| syncpack | 15.3.3 | Version alignment + pnpm-catalog policy enforcement (`lint` only, never `format`) | ✅ |
| commander | 14.0.3 (**not** 15 — its `node >=22.12` floor rejects legit Next 16 consumers) | CLI framework | ✅ |
| @clack/prompts / magicast / comment-json / tinyglobby / picocolors / diff | 1.7.0 / 0.5.4 / 5.0.0 / 0.2.17 / 1.1.1 / 9.0.0 | CLI prompts, next.config AST patching, comment-preserving tsconfig edits, globbing, colors, diffs | ✅ |
| server-only / client-only | 0.0.1 | Poison-pill packages, installed as real deps | ✅ |
| @types/node / @types/react / @types/react-dom | 24.13.3 / 19.2.18 / 19.2.4 | Types (@types/node pinned to the Node 24 line, not latest 26.x) | ✅ |

### ⚠️ Not safe to adopt yet — with fallback

- **⚠️ typescript-eslint on TS7**: peer is `>=4.8.4 <6.1.0` and TS 7.0.2 exports only `{version}` from `require("typescript")` — type-aware lint hard-crashes. **Fallback (adopted, verified in a real pnpm workspace): the HYBRID** — real `typescript@7.0.2` everywhere, and *only* `packages/eslint-config` carries `"typescript": "npm:@typescript/typescript6@6.0.2"` as a devDependency. Result: root `.bin/tsc` = 7.0.2 (Next + check-types), typescript-estree resolves TS 6.0.3, zero peer warnings, no bin collision (typescript6's bin is `tsc6`). **RESOLVED against** the root-level global alias pair proposed by another researcher: Next's `getTypeScriptPackageInfo` reads `packageJson.bin.tsc` of whatever resolves as `typescript` — typescript6's bin is `tsc6`, so a global alias breaks `next build`. Also **no `pnpm.overrides` on `typescript`** (it would clobber the scoped alias). `tsc --noEmit` (TS7) is the authority; lint findings from the TS6 checker are enforced style. Revisit when typescript-eslint ships TS ≥7.1 support (their issue #10940).
- **⚠️ TS7 language-service plugins**: no tsserver, no `plugins: [{"name":"next"}]` support. Fallback: keep the key in the nextjs preset (inert under TS7) and ship `.vscode/settings.json` pointing `typescript.tsdk` at the TS6 alias inside eslint-config so editors keep the Next plugin.
- **⚠️ tsdown `tsgo` dts generator**: auto-selected when TS7 is installed and self-documented as not production-ready. Fallback (adopted): `isolatedDeclarations: true` in the library tsconfig + `dts: { generator: "oxc" }` — declaration emit never touches the TypeScript package.
- **⚠️ npm Trusted Publishing (OIDC)**: npm/cli#8544 and #8976 (scoped packages via changesets/action) still open. Fallback: granular `NPM_TOKEN` secret behind a protected `release` GitHub environment. **npm provenance is structurally impossible for restricted packages** — `provenance: false` in every publishConfig and `NPM_CONFIG_PROVENANCE=false` in release env.
- **⚠️ Custom export conditions in Turbopack**: not supported; a custom condition silently falls through to `default`. Fallback: only `react-server`, `browser`, `default` conditions + `server-only` imports + subpath separation. Consequently tsdown's `devExports` source-condition feature is **not** used and `customConditions` is dropped from the tsconfig presets.
- **⚠️ @tsdown/css**: experimental and version-locked to tsdown. **Deferred** — the foundation ships no component CSS. `styles.css` (Tailwind v4 `@source` registration, verified) lives at the frontend package root, no CSS build needed. Adopt `@tsdown/css` (exact-pinned, with `inject: true`) when components gain stylesheets.
- **⚠️ Lighthouse CI**: nondeterministic, measures the consumer's app, cannot block PRs. Fallback: size-limit per-export budgets are the blocking gate; Lighthouse optional nightly on the example app, later.
- **⚠️ E2E coverage merge into the 100% gate**: Chromium-only CDP data + minified-bundle remapping = nondeterministic gate. Not adopted. E2E is behavioral pass/fail only.

### Explicitly not adopted (and why)
`eslint-plugin-only-warn` (destroys the error signal; remove from starter) · `eslint-plugin-react-compiler` (bundled in react-hooks 7) · `eslint-plugin-import` (no ESLint 10 peer) · `eslint-plugin-boundaries` (redundant, vague peers) · tsdown `exports` generator (**RESOLVED**: `exports: false`, hand-written maps — the generator omits `types` conditions, rewrites package.json every build, and would clobber the `browser`-guard conditions) · `syncpack format` (fights prettier-plugin-packagejson) · `changeset publish` (ships literal `workspace:^` — publish via `pnpm publish -r`) · Vercel/third-party remote cache (supply-chain surface; actions/cache on `.turbo/cache`) · CJS output of any kind (ESM-only; `dts.cjsReexport` is the documented escape hatch if a CJS consumer ever materializes) · `coverage.all`, vitest `workspace` field, per-package `coverage` blocks (all removed/ignored in Vitest 4).

---

## 2. Repository layout

Every file below is created by the foundation work.

```
point-of-sale/
├── .changeset/
│   └── config.json
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .husky/
│   ├── pre-commit
│   ├── commit-msg
│   └── pre-push
├── .nukes/
│   └── RESEARCH.md                      # this record
├── .vscode/
│   └── settings.json                    # TS6 tsdk for editors
├── .gitignore
├── .lintstagedrc.json
├── .npmrc                               # scope→registry pin only, NO auth line
├── .prettierignore
├── .prettierrc.json
├── .size-limit.json
├── .syncpackrc.json
├── LICENSE                              # proprietary; copied into every published package
├── README.md
├── commitlint.config.js
├── knip.json
├── package.json
├── playwright.config.ts
├── pnpm-workspace.yaml                  # packages + catalog + publishBranch/gitChecks
├── turbo.json
├── vitest.config.ts                     # the ONLY place coverage is configured
├── docs/
│   └── architecture/
│       └── isolation.md
├── e2e/
│   └── smoke.spec.ts
├── scripts/
│   └── assert-coverage-gate-fails.mjs   # coverage-gate canary
├── apps/
│   └── example/                         # private consumer app; E2E target; CLI-template fixture
│       ├── app/
│       │   ├── layout.tsx
│       │   └── page.tsx                 # renders an <h1> "Nukes POS" (contract with e2e/smoke.spec.ts)
│       ├── eslint.config.js
│       ├── next.config.ts
│       ├── next-env.d.ts                # generated by next typegen
│       ├── package.json
│       └── tsconfig.json
└── packages/
    ├── typescript-config/               # private
    │   ├── base.json
    │   ├── library.json
    │   ├── nextjs.json
    │   ├── package.json
    │   └── react-library.json
    ├── eslint-config/                   # private; carries the TS6 alias
    │   ├── base.js
    │   ├── boundaries.js
    │   ├── package.json
    │   └── react.js
    ├── common/                          # published, isomorphic
    │   ├── CHANGELOG.md                 # created by changesets on first release
    │   ├── LICENSE
    │   ├── README.md
    │   ├── eslint.config.js
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tsdown.config.ts
    │   ├── vitest.config.ts
    │   └── src/
    │       ├── index.ts                 # barrel (re-exports only — lint/coverage rule)
    │       ├── constants/
    │       │   ├── index.ts             # barrel
    │       │   └── locations.ts         # demo: branch/location constants (flat multi-location model)
    │       ├── i18n/
    │       │   ├── index.ts             # barrel + demo t() helper re-export
    │       │   ├── translate.ts
    │       │   ├── translate.test.ts
    │       │   └── locales/
    │       │       ├── en.ts
    │       │       └── ne.ts
    │       ├── money/
    │       │   ├── format.ts            # demo: formatMoney (size-limit tree-shaking probe)
    │       │   └── format.test.ts
    │       ├── runtime/
    │       │   ├── index.ts             # barrel
    │       │   ├── guard.ts             # assertServerRuntime / assertClientRuntime
    │       │   └── guard.test.ts
    │       ├── schemas/
    │       │   ├── index.ts             # barrel
    │       │   ├── order.ts             # demo zod-less schema/validator example
    │       │   └── order.test.ts
    │       └── types/
    │           └── index.ts             # type-only exports (LocationId, OrderLine, …)
    ├── backend/                         # published, SERVER-ONLY
    │   ├── LICENSE
    │   ├── README.md
    │   ├── eslint.config.js
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tsdown.config.ts
    │   ├── vitest.config.ts
    │   ├── vitest.setup.ts              # fails fast if DOM globals leak into the env
    │   ├── src/
    │   │   ├── index.ts                 # barrel; first line: import "server-only"
    │   │   ├── internal/
    │   │   │   ├── browser-guard.ts     # throwing module behind the "browser" condition
    │   │   │   └── browser-guard.test.ts
    │   │   ├── ports/
    │   │   │   ├── index.ts             # barrel
    │   │   │   └── order-repository.ts  # port interface (locationId on every method)
    │   │   └── adapters/
    │   │       └── demo/
    │   │           ├── index.ts         # barrel; import "server-only"
    │   │           ├── demo-order-repository.ts
    │   │           └── demo-order-repository.test.ts
    │   └── test/
    │       └── boundary.dist.test.ts    # dist contract: server-only survives, no "use client"
    ├── frontend/                        # published, mixed RSC + client
    │   ├── LICENSE
    │   ├── README.md
    │   ├── eslint.config.js
    │   ├── package.json
    │   ├── styles.css                   # Tailwind v4 @source "./dist" registration (shipped)
    │   ├── tsconfig.json
    │   ├── tsdown.config.ts
    │   ├── vitest.config.ts
    │   ├── vitest.setup.ts              # RTL cleanup (mandatory under globals:false)
    │   ├── src/
    │   │   ├── client/
    │   │   │   ├── index.ts             # barrel — NO "use client" here (enforced)
    │   │   │   ├── order-ticket.tsx     # "use client" leaf demo (size-limit probe)
    │   │   │   └── order-ticket.test.tsx
    │   │   └── server/
    │   │       ├── index.ts             # barrel; first line: import "server-only"
    │   │       ├── order-summary.tsx    # sync RSC demo (unit-testable pure component)
    │   │       └── order-summary.test.tsx
    │   └── test/
    │       └── boundary.dist.test.ts    # dist contract: directives survive the build
    └── cli/                             # published, ESM-only, `npx @nukesai-pos/cli init`
        ├── LICENSE
        ├── README.md
        ├── eslint.config.js
        ├── package.json
        ├── tsconfig.json
        ├── tsdown.config.ts
        ├── vitest.config.ts
        ├── src/
        │   ├── main.ts                  # bin entry (coverage-excluded wiring only)
        │   ├── commands/
        │   │   ├── add.ts
        │   │   ├── doctor.ts
        │   │   ├── init.ts
        │   │   └── upgrade.ts
        │   └── utils/
        │       ├── detect.ts            # framework detection (shadcn pattern)
        │       ├── detect.test.ts
        │       ├── git.ts               # assertCleanWorktree
        │       ├── git.test.ts
        │       ├── patch.ts             # magicast next.config wrap + comment-json tsconfig edit
        │       ├── patch.test.ts
        │       ├── stamp.ts             # content-hash header for upgrade-without-clobbering
        │       └── stamp.test.ts
        └── templates/
            └── consumer/
                ├── .npmrc               # literal ${NPM_TOKEN} auth template
                ├── app/(nukes-pos)/.gitkeep   # route-group isolation (Payload pattern)
                └── nukes-pos.json       # persisted-answers manifest template
```

---

## 3. Package architecture

### Layering rule (strict, lint-enforced)

```
common  ←  backend        (backend may import common)
common  ←  frontend       (frontend may import common)
NOTHING ELSE.
```
- `frontend` **never** imports `backend` (and vice versa). Data crosses that boundary only as serializable props / route handlers in the consumer app.
- `common` is a **leaf**: imports neither sibling, no Node builtins, no DOM, no `process.env`.
- `cli` imports **no** workspace package at runtime — it scaffolds files that *reference* them. (Its templates pin `@nukesai-pos/*@<own version>`, which works because versioning is fixed.)
- config packages (`eslint-config`, `typescript-config`) are devDependency-only, private, never published.

### @nukesai-pos/common — isomorphic leaf
- **Responsibility**: i18n (en/ne locales), shared types, schema validators, constants (incl. the flat multi-location model: `LocationId` everywhere), runtime guards.
- **Entry points**: `.`, `./types`, `./constants`, `./schemas`, `./i18n`, `./i18n/locales/*` (per-locale so importing `ne` never pays for `en`), `./runtime`, `./package.json`.
- **Runtime**: isomorphic, provably — no Node builtins, no DOM globals, no `process.env` (config is injected as parameters). `platform: "neutral"`, `sideEffects: false`.
- **Deps**: none. No peers.

### @nukesai-pos/backend — server-only
- **Responsibility**: route-handler logic, business logic, data access **ports** and the demo adapter. Never a line of UI.
- **Entry points**: `.` (guarded), `./ports` (interfaces — importable anywhere for types), `./adapters/demo` (guarded), `./package.json`. (Future: `./handlers`, `./next` for the `withNukesPos` config wrapper — added when route logic lands.)
- **Runtime**: server-only, triple-locked: (1) `import "server-only"` first line of every non-`ports` entry; (2) `"browser"` export condition on guarded entries resolves to a throwing `dist/_browser_guard.js` — verified to fail a Next 16 client build at build time with the real module absent from `.next/static`; (3) `default` condition points at the **real** module (**RESOLVED** against the poison-`default` variant: it would break plain-Node consumers like vitest unless every runner sets `resolve.conditions: ['react-server']`; the verified browser-guard + server-only combination achieves the same isolation without that tax).
- **Deps**: `@nukesai-pos/common` (`workspace:^`), `server-only`. **Peers**: `next ^16.3.0` only — deliberately *no* react/react-dom peer, so a react import in backend fails resolution/typecheck by construction.
- **Ports/adapters shape** (data layer deferred): `src/ports/*.ts` defines interfaces only (`OrderRepository`, later `PaymentGateway`, `InventoryRepository`, …) — every method takes `locationId: LocationId` as its first parameter (flat DB, branch isolation, explicitly not multi-tenant). `src/adapters/demo/` is an in-memory implementation exporting `createDemoOrderRepository()`. Business logic depends only on ports; a future Drizzle/Prisma adapter is a new `src/adapters/<driver>/` + a new export subpath — zero public-API change.

### @nukesai-pos/frontend — mixed RSC + client
- **Responsibility**: admin-panel UI and (later) route scaffolding surface.
- **Entry points**: `./server` (RSC components, `import "server-only"`), `./client` (client barrel; directives live on **leaves** only), `./styles.css` (Tailwind v4 `@source` registration), `./package.json`. **No root `.` export** — there is no import specifier that yields both halves (**RESOLVED** in favor of the publishing researcher's boundary-by-construction design). Later: `./components/*` per-feature subpaths.
- **Runtime**: `src/server/**` = RSC/Node graph; `src/client/**` = browser (+SSR pass). `platform: "neutral"`, `sideEffects: ["**/*.css"]`.
- **Deps**: `@nukesai-pos/common` (`workspace:^`), `server-only`. **Peers**: `next ^16.3.0`, `react ^19.2.0`, `react-dom ^19.2.0` (exact copies in devDependencies for standalone build/test).
- **Lazy loading**: dynamic-import boundaries live **inside `"use client"` modules** using `next/dynamic` (never re-exported; `ssr: false` is illegal in RSC; RSC→client dynamic import does not code-split). unbundle preserves the `import()` calls so the consumer's Turbopack splits chunks.

### @nukesai-pos/cli — published scaffolder
- **RESOLVED contradiction in the brief**: the brief listed the CLI under "private, non-published", but the chosen integration model is `npx @nukesai-pos/cli init` — npx resolves from the registry, so the CLI **must be published** (restricted) and is in the fixed version group. Only eslint-config and typescript-config stay private.
- **Commands**: `init` (detect → prompt → write `nukes-pos.json` → scaffold `app/(nukes-pos)/**` route group → patch next.config/tsconfig/.npmrc/env), `add <feature…>`, `doctor` (read-only diagnosis, exit 1 on error), `upgrade` (hash-stamp aware, **defaults to dry-run**). Global flags per command: `--cwd`, `--yes`, `--dry-run`, `--silent`, `--force`.
- **Safety**: refuses to run on a dirty worktree without `--force`; every generated file carries `// @nukesai-pos/cli generated — do not edit. hash: <sha256-of-body>` (hash computed over the body *excluding* the stamp line, line-endings normalized); pristine → overwrite, edited → write `<name>.new.ts` + render diff (`diff@9`). Precedent: `shadcn add --overwrite/--dry-run/--diff` (per verification: the standalone `diff` command is deprecated).
- **Never uses the TypeScript AST API** (TS7 has none; TS6-dependent tools would need the alias trick). Config patching = magicast (next.config) + comment-json (tsconfig) — both verified idempotent.
- **CJS caveat it enforces**: our packages are ESM-only, so the CLI scaffolds/expects `next.config.ts|mjs`, never CJS.

### Internal packages
- **typescript-config** (private): 4 presets — `base.json`, `library.json` (adds `isolatedDeclarations`), `react-library.json`, `nextjs.json` (pre-set to Next 16.3's tsconfig fixed point so `next typegen` never rewrites it). Every TS7-changed default is pinned explicitly. No `tsBuildInfoFile` in presets (verified to resolve relative to the declaring file).
- **eslint-config** (private): `base.js` (factory — takes `tsconfigRootDir`), `react.js`, `boundaries.js` (factory — takes `packageDir` + `zone`). Carries the TS6 alias so typescript-eslint works while the repo runs TS7.

---

## 4. SSR/CSR isolation contract

Normative version lives at `docs/architecture/isolation.md` (Appendix). Summary of the enforced rules:

### Mechanisms and what each guarantees
| Mechanism | Layer | Guarantee |
|---|---|---|
| `"use client"` on **leaf** files only | bundler | Marks client-subtree entry. Barrels with the directive leak every unused export into the consumer bundle (verified) — **forbidden** |
| `import "server-only"` first line of server entries | resolver+eval | Build-time error when a client module reaches it (Next intercepts the specifier; the npm package covers non-Next RSC bundlers). Installed as a real dependency |
| `"browser"` export condition → throwing guard | resolver | Turbopack resolves it in the app-client layer ⇒ hard build failure, real module never enters the client graph (verified) |
| `react-server` condition | resolver | Available for future per-graph splits; custom conditions are **forbidden** (Turbopack ignores them) |
| `assertServerRuntime()` / `assertClientRuntime()` (`@nukesai-pos/common/runtime`) | runtime | Last-resort net; catches misconfiguration, not mistakes |

### Directory convention (directories, not filename suffixes)
```
src/server/   # RSC/Node only — poisoned with server-only
src/client/   # browser — "use client" on leaves, never on index.ts
(shared code lives in @nukesai-pos/common, not in a shared/ dir)
```
Chosen because `import-x/no-restricted-paths` zones and flat-config `files` globs key off directory prefixes, and directories map 1:1 onto export subpaths and unbundle output.

### Lint enforcement (two layers, both kept — neither is a superset)
1. **`no-restricted-imports`** (core): matches specifier strings — bans `@nukesai-pos/backend`, `server-only`, node builtins (bare **and** `node:`-prefixed list) in client zones; bans client imports and DOM globals in server zones; bans everything runtime-specific in `common`.
2. **`import-x/no-restricted-paths`** (resolved paths, TS resolver **required**): `client/**` ✗→ `server/**`, plus package-level bans. Exported as a factory `boundaries({ packageDir, zone })` because `basePath` must be each package's own dir — a shared static config silently matches nothing.

Zones per package: backend = `server` (rules applied to `src/**`), frontend = `mixed`, common = `isomorphic` (rules applied to `src/**` + leaf-package import ban), cli = none (Node CLI, builtins allowed).

### Automated dist test (the gate lint cannot provide)
`packages/{frontend,backend}/test/boundary.dist.test.ts` runs in the root vitest pass (which builds first — root `test` script runs `turbo run build` before `vitest`):
- every non-barrel `dist/client/**` chunk **starts with** `"use client"`; barrels (`index.js`) must **not** carry it;
- no client chunk imports `server-only` or a node builtin;
- no server chunk carries `"use client"`; guarded server entries keep `import "server-only"`;
- `dist/_browser_guard.js` exists and throws; globs assert non-empty match sets (no vacuous passes).
Verified failure modes it catches: tsdown bundled mode silently **drops** directives (`unbundle: true` is the only preservation mechanism — there is no `preserveDirectives` option), and tree-shaking removing the poison pill.

---

## 5. Build & tree-shaking strategy

### Universal tsdown rules (all published packages)
- `format: 'esm'` only, `"type": "module"`, `fixedExtension: false` (plain `.js`), no minify (consumer bundler minifies), `treeshake: true`, `sourcemap: true` + `dts: { sourcemap: true }` together (prevents the dangling `.d.ts.map` reference).
- **`unbundle: true` — MANDATORY**, it is the only thing that preserves `"use client"` / `"use server"` and gives 1-file-per-module output for consumer-side code splitting.
- `hash: false` (default true would break hand-written exports paths), `root: 'src'` (pins the dist layout).
- `dts: { generator: 'oxc' }` + `isolatedDeclarations: true` in tsconfig — declaration emit never selects the experimental tsgo path. Cost accepted: every export needs explicit types (TS9013 on inference) — enforced anyway by `explicit-module-boundary-types`.
- `deps: { neverBundle: true }` (`external`/`noExternal` are deprecated), `exports: false` (hand-written maps; CI asserts `git diff --exit-code -- 'packages/*/package.json'` after build).
- In-build gates: `publint: true`, `attw: { profile: 'esm-only', level: 'error' }` (exact hyphenated literal — `esmOnly` silently no-ops), `failOnWarn: 'ci-only'`. publint runs first conceptually: attw exits 0 when a package ships **no** types at all, so publint is the primary gate.
- Platforms: common + frontend `neutral`, backend `node`, cli `node`.

### Exports maps (hand-written, `types` first, verified publint/attw-clean)
- **common**: 8 subpaths incl. `./i18n/locales/*` wildcard; `sideEffects: false` (load-bearing — verified: removing it ships unused modules to the consumer bundle).
- **frontend**: `./server` + `./client` + `./styles.css`, no root export; `sideEffects: ["**/*.css"]` (array form preserves CSS emission while shaking JS).
- **backend**: `.` and `./adapters/demo` carry `"browser": "./dist/_browser_guard.js"`; `./ports` unguarded (type-safe interfaces).
- All: `"./package.json": "./package.json"`, `files` allowlist `["dist", "src", "styles.css"?, "README.md", "LICENSE", "CHANGELOG.md"]` (fail-closed; `src` shipped so sourcemaps resolve — restricted access means only licensed customers see it). npm force-includes LICENSE; CHANGELOG must be listed explicitly.

### Consumer-side guidance (scaffolded by the CLI)
`serverExternalPackages: ['@nukesai-pos/backend']` (mandatory once a real driver lands), `experimental.optimizePackageImports` for frontend/common (nice-to-have — the subpath+leaf-directive+sideEffects design was verified to shake without it), Tailwind v4 consumers just `@import "@nukesai-pos/frontend/styles.css"` (contains `@source "./dist"`, verified to register the package as a scan source through pnpm symlinks).

### Perf budget (size-limit, blocking in CI, `gzip: true` explicitly — default is brotli)
| Check | Budget |
|---|---|
| common full entry | 8 kB |
| common single export `{ formatMoney }` (tree-shaking proof) | 1.5 kB |
| frontend client entry (react/react-dom/next ignored) | 45 kB |
| frontend single component `{ OrderTicket }` (tree-shaking proof) | 6 kB |
| backend server entry | 60 kB |

A jump in a per-`import` budget means tree-shaking broke — exactly the Lighthouse regression this prevents. Budget increases require a dedicated, reviewed commit.

---

## 6. Testing strategy

### Vitest 4 layout — one root run, root-only coverage
- Root `vitest.config.ts` declares `projects: ['packages/common','packages/backend','packages/frontend','packages/cli']` (`projects` replaced the removed `workspace` field). Per-package configs carry **only** name/environment/setup/include — `coverage` is a `NonProjectOption` and is *silently ignored* in project configs.
- One root run ⇒ one unified coverage number. No nyc/istanbul merge. CI sharding (when needed): shards run `vitest run --coverage --reporter=blob --shard=i/n --coverage.thresholds.100=false` (per-shard gate MUST be off), then `vitest run --merge-reports --coverage` enforces once.
- Environments: backend/common/cli `node`; frontend `jsdom` + `@vitejs/plugin-react`; `globals: false` everywhere ⇒ frontend setup file **must** call RTL `cleanup()` (auto-cleanup does not register without a global `afterEach` — verified DOM leakage otherwise). Backend setup asserts no DOM globals leaked in.

### The honest 100% gate
- `coverage.include: ['packages/*/src/**/*.{ts,tsx}']` — **the load-bearing line**. Vitest 4 removed `coverage.all`; without `include`, untested files are invisible and the run reports a fraudulent green 100% (reproduced).
- `coverage.exclude` (defaults to `[]` in v4, every exclusion explicit): `**/*.d.ts`, `**/*.test.{ts,tsx}`, `**/index.ts` (pure re-export barrels ONLY — house rule: logic never lives in an index.ts), `packages/cli/src/main.ts` (bin wiring), `**/dist/**`.
- `thresholds: { 100: true, perFile: true }` (typed shorthand for all-four=100; perFile names the offending file). No `autoUpdate`.
- `passWithNoTests: false` at root. Genuinely unreachable branches use targeted `/* v8 ignore next */` with a justification comment — never a lowered threshold.
- **Canary**: `scripts/assert-coverage-gate-fails.mjs` writes an untested file, asserts the run FAILS, deletes it. Runs in CI (`pnpm coverage:canary`). A gate never observed failing is not a gate.
- Foundation demo exports all ship with tests so the gate is exercised, not vacuous. Frontend RSC demos are **sync pure components** so RTL can render them; if async RSC shells appear later, they must stay thin and be excluded by precise glob, never `**/*.tsx`.

### E2E (Playwright 1.62.1)
- Root `playwright.config.ts`, specs in `e2e/`, three projects (chromium / webkit / iPhone 15 — device names verified). `webServer` runs the **production** `next start` of `apps/example` on dedicated port 3100 (never a stale dev server on 3000). `blob` reporter in CI for future sharding + `playwright merge-reports`.
- E2E is a separate CI job and root script (`pnpm e2e`), outside the unit-test flow. Its coverage is **never** merged into the unit number.
- Deviation from the Turborepo Playwright guide, deliberate: we run playwright at the root after `turbo run build` rather than as a cached turbo task; revisit caching when E2E gets slow.

---

## 7. Quality gates & git workflow

### ESLint layers (all flat, ESLint 10)
1. `@nukesai-pos/eslint-config/base` — factory: ignores → `@eslint/js` recommended → tseslint `strictTypeChecked` + `stylisticTypeChecked` (type-style only, no Prettier collision) → turbo `flat/recommended` → projectService languageOptions → house rules (consistent-type-imports/exports, explicit-module-boundary-types, no-floating-promises, enum ban via no-restricted-syntax — pairs with `erasableSyntaxOnly`) → untyped-JS carve-out → test relaxations → `eslint-config-prettier/flat` **last**.
2. `…/react` — adds `reactHooks.configs.flat.recommended` (NOT top-level `.configs.recommended` — that's the legacy eslintrc shape) and `nextPlugin.configs['core-web-vitals']` (already flat), disables `@next/next/no-html-link-for-pages` (app-router-only noise).
3. `…/boundaries` — the SSR/CSR zone factory (§4).

### Prettier
Owns 100% of formatting. 3.9.6 + `prettier-plugin-packagejson` (canonical package.json field order — which is also why `syncpack format` is banned). `experimentalOperatorPosition` and `objectWrap` are verified-real 3.9 options.

### Hooks (husky 9 format: plain command lines, no shebang, no husky.sh preamble; `"prepare": "husky"`)
- `pre-commit`: `lint-staged` → prettier only (type-aware ESLint is too slow for per-commit).
- `commit-msg`: `commitlint --edit "$1"` — config-conventional types (build chore ci docs feat fix perf refactor revert style test) + `scope-empty: never` + `scope-enum`: `backend, frontend, common, cli, eslint-config, typescript-config, example, repo, ci, deps, release`.
- `pre-push`: `turbo run check-types lint --output-logs=errors-only` (turbo cache absorbs the cost).

### Changesets (3.0.1)
`fixed: [[common, backend, frontend, cli]]` — one product version; the CLI scaffolds `@nukesai-pos/*@<own version>` with no lookup table. `privatePackages: { version: false, tag: false }` (config packages + example never versioned/tagged). `bumpVersionsWithWorkspaceProtocolOnly: true`; internal prod deps are `workspace:^` (publishes as `^x.y.z`). `changedFilePatterns` keeps doc/test-only edits from demanding changesets. Publish path is **only** the root `release` script: `turbo run build && pnpm publish -r --no-git-checks --access restricted --report-summary` (pnpm rewrites `workspace:` — `changeset publish` would ship literal `workspace:^`). No `prepublishOnly` gates (a mid-sequence failure would leave earlier packages published); the gate (publint+attw at `level: error`) runs inside every build **before** any tarball uploads.

### CI job graph (`.github/workflows/ci.yml`)
`verify` job: checkout → pnpm/action-setup@v6 (reads `packageManager`) → setup-node@v7 (node 24, pnpm cache) → actions/cache@v6 on `.turbo/cache` → `pnpm install --frozen-lockfile` → `syncpack lint` → `prettier --check .` → `turbo run lint` → `turbo run check-types` → `turbo run build` → assert no package.json drift → `pnpm test` (build is cached; vitest + 100% gate) → `pnpm coverage:canary` → `pnpm size` → `pnpm knip` → upload coverage.
`e2e` job (parallel): install → Playwright browser cache → `turbo run build` → `pnpm e2e` → upload report.
`release` workflow: on push to main, protected `release` environment, hand-written `$HOME/.npmrc` with literal `${NPM_TOKEN}` (no `registry-url` on setup-node), `changesets/action@v2.1.1` with kebab-case `version-script`/`publish-script`, `NPM_CONFIG_PROVENANCE: "false"`.

---

## 8. Open risks

| # | Risk | Fallback / action |
|---|---|---|
| 1 | **npm org not purchased** — restricted scoped publish fails HTTP 402; invisible until first publish | Buy the npm Team/Org plan for `@nukesai-pos` and do the **manual first publish of all four packages from a workstation** before wiring release.yml. Verify with `npm access list packages @nukesai-pos` |
| 2 | **tsdown dts under the eslint-config TS6 alias** — UNVERIFIED whether any tsdown path ever resolves `typescript` cross-package | The oxc generator is TS-independent by design; still, on first real build assert the log **never** contains `Emit types with typescript@` or `does not yet have a stable API` — add that grep as a CI check |
| 3 | **TS6 (lint) vs TS7 (check) semantic drift** — type-aware rules reason from a different checker | `tsc --noEmit` (TS7) is the authority; both typescript specifiers exact-pinned; tracking note on typescript-eslint TS7 support (#10940) |
| 4 | **Tailwind v4 `@source "./dist"` through pnpm symlinks** — verified in a scratch fixture, not yet in this repo's example app | E2E fixture assertion: a utility class used only inside `@nukesai-pos/frontend/dist` must appear in the example app's generated CSS. If symlinks defeat it, ship fully-resolved CSS and make Tailwind consumer-side only |
| 5 | **`browser`-guard error is cryptic** (`Export X doesn't exist in target module …_browser_guard.js [app-client]`) | `server-only` fires first with Next's clear message; the guard's own throw message names the fix; documented in isolation.md |
| 6 | **attw passes packages that ship zero `.d.ts`** | publint --strict catches it (verified exit 1) and runs in every build; boundary tests also stat key `.d.ts` files |
| 7 | **UNVERIFIED syncpack keys**: exact `versionGroups` sub-key set of the v15 Rust rewrite beyond what was live-tested (`dependencies`, `dependencyTypes`, `pinVersion`, `policy: "catalog"`, `isIgnored` were tested) | First `syncpack lint` run validates the committed config; syncpack errors loudly on unknown/deprecated keys (verified behavior) |
| 8 | **knip config will need tuning** on first run (tsdown's optional peers publint/@arethetypeswrong/core, `templates/` files) | Run `pnpm knip` locally before enabling as CI gate; add `ignoreDependencies` entries with comments as needed |
| 9 | **engines floor of published packages** — `>=20.19.0` chosen for consumer reach; repo dev/CI is Node 24 only | If a Node 20/22 consumer regression appears, add a Node 20 CI matrix leg for the packed tarballs |
| 10 | **Turbo `$TURBO_DEFAULT$` hashes only git-tracked files** — fresh untracked dirs hash almost nothing | Documented in CONTRIBUTING: `git add` before trusting `turbo --dry` input counts |
| 11 | **`@source`/CSS pipeline deferred** (@tsdown/css experimental) | When components gain CSS: exact-pin `@tsdown/css` to tsdown's version, `css: { splitting: true, inject: true, modules: {} }` (`inject: true` is required or imports are stripped), attw `excludeEntrypoints: [/\.css$/]` |
| 12 | **CLI patchers write into customer repos** | Clean-worktree guard, `--dry-run` everywhere (default for `upgrade`), patchers unit-tested against fixtures: `app/` vs `src/app/`, `next.config.{js,mjs,ts}`, already-patched (idempotency verified with magicast) |
| 13 | **size-limit budgets on a near-empty foundation** | Budgets set with deliberate headroom (§5); increases require a dedicated reviewed commit |

---

## 9. Appendix — file contents (written verbatim)

### `package.json` (root)
```json
{
  "name": "@nukesai-pos/monorepo",
  "version": "0.0.0",
  "private": true,
  "description": "Nukes AI point-of-sale platform monorepo.",
  "license": "UNLICENSED",
  "author": "Nukes AI & Software Solution <info@nukesai.com>",
  "type": "module",
  "packageManager": "pnpm@11.10.0",
  "engines": {
    "node": ">=24.18.0",
    "pnpm": ">=11.10.0"
  },
  "scripts": {
    "prepare": "husky",
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "check-types": "turbo run check-types",
    "test": "turbo run build --output-logs=errors-only && vitest run --coverage",
    "coverage:canary": "node scripts/assert-coverage-gate-fails.mjs",
    "e2e": "playwright test",
    "size": "size-limit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "knip": "knip",
    "syncpack:lint": "syncpack lint",
    "changeset": "changeset",
    "version-packages": "changeset version && pnpm install --lockfile-only",
    "release": "turbo run build && pnpm publish -r --no-git-checks --access restricted --report-summary"
  },
  "devDependencies": {
    "@changesets/cli": "catalog:",
    "@commitlint/cli": "catalog:",
    "@commitlint/config-conventional": "catalog:",
    "@playwright/test": "catalog:",
    "@size-limit/preset-small-lib": "catalog:",
    "@vitest/coverage-v8": "catalog:",
    "husky": "catalog:",
    "knip": "catalog:",
    "lint-staged": "catalog:",
    "prettier": "catalog:",
    "prettier-plugin-packagejson": "catalog:",
    "size-limit": "catalog:",
    "syncpack": "catalog:",
    "turbo": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

### `pnpm-workspace.yaml`
```yaml
packages:
  - apps/*
  - packages/*

# pnpm 10/11 moved these OUT of .npmrc; writing them there silently does nothing.
publishBranch: main
gitChecks: true

# Version single-source-of-truth. syncpack's `policy: "catalog"` group enforces
# that no package bypasses it. The one deliberate exception: the TS6 lint alias
# in packages/eslint-config (aliased specifier, cannot be catalogued).
catalog:
  "@arethetypeswrong/core": 0.18.5
  "@changesets/cli": 3.0.1
  "@clack/prompts": 1.7.0
  "@commitlint/cli": 21.2.2
  "@commitlint/config-conventional": 21.2.2
  "@eslint/js": 10.0.1
  "@next/eslint-plugin-next": 16.3.1
  "@playwright/test": 1.62.1
  "@size-limit/preset-small-lib": 13.0.3
  "@testing-library/dom": 10.4.1
  "@testing-library/jest-dom": 7.0.1
  "@testing-library/react": 16.3.2
  "@types/node": 24.13.3
  "@types/react": 19.2.18
  "@types/react-dom": 19.2.4
  "@vitejs/plugin-react": 6.1.0
  "@vitest/coverage-v8": 4.1.11
  comment-json: 5.0.0
  commander: 14.0.3
  diff: 9.0.0
  eslint: 10.8.1
  eslint-config-prettier: 10.1.8
  eslint-import-resolver-typescript: 4.4.5
  eslint-plugin-import-x: 4.17.1
  eslint-plugin-react-hooks: 7.1.1
  eslint-plugin-turbo: 2.10.11
  globals: 17.11.0
  husky: 9.1.7
  jsdom: 30.0.1
  knip: 6.32.2
  lint-staged: 17.3.0
  magicast: 0.5.4
  next: 16.3.1
  picocolors: 1.1.1
  prettier: 3.9.6
  prettier-plugin-packagejson: 3.0.2
  publint: 0.3.24
  react: 19.2.8
  react-dom: 19.2.8
  server-only: 0.0.1
  size-limit: 13.0.3
  syncpack: 15.3.3
  tinyglobby: 0.2.17
  tsdown: 0.22.14
  turbo: 2.10.11
  typescript: 7.0.2
  typescript-eslint: 8.67.0
  vitest: 4.1.11
```

### `turbo.json`
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "globalDependencies": ["pnpm-lock.yaml", "pnpm-workspace.yaml"],
  "globalEnv": ["NODE_ENV", "CI"],
  "globalPassThroughEnv": ["NPM_TOKEN", "GITHUB_TOKEN"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!**/*.test.ts", "!**/*.test.tsx", "!**/test/**"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["NODE_ENV"]
    },
    "lint": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/eslint-config/**"],
      "outputs": []
    },
    "check-types": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/typescript-config/**"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```
Note: unit tests are deliberately NOT a turbo task — Vitest 4 coverage is root-only, so `pnpm test` runs `turbo run build` (cached) followed by one root `vitest run --coverage`. E2E is likewise a root script (`pnpm e2e`) run after `turbo run build` in its own CI job.

### `vitest.config.ts` (root — the ONLY place coverage may be configured)
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Vitest 3.2 renamed `workspace` -> `projects`; Vitest 4 removed `workspace`.
    projects: [
      'packages/common',
      'packages/backend',
      'packages/frontend',
      'packages/cli',
    ],

    // Root-only option: a repo-wide run that finds no tests must fail loudly.
    passWithNoTests: false,

    // COVERAGE IS ROOT-ONLY. `coverage` is in Vitest's NonProjectOptions union;
    // a `coverage` block inside packages/*/vitest.config.ts is SILENTLY IGNORED.
    coverage: {
      provider: 'v8',

      // CRITICAL — `coverage.all` was REMOVED in Vitest 4. Without an explicit
      // `include`, only files a test already imported are reported, so a wholly
      // untested file is invisible and the run reports a fraudulent green 100%.
      include: ['packages/*/src/**/*.{ts,tsx}'],

      // `coverage.exclude` defaults to [] in Vitest 4 — every exclusion explicit.
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        // Pure re-export barrels ONLY (house rule: logic never lives in index.ts).
        '**/index.ts',
        // CLI bin wiring (commander setup + parseAsync); commands/utils are covered.
        'packages/cli/src/main.ts',
        '**/dist/**',
      ],

      // `100: true` === statements/functions/branches/lines: 100, self-documenting.
      // perFile stops one big covered file from masking untested ones and names
      // the offending file in the error. autoUpdate deliberately omitted.
      thresholds: {
        100: true,
        perFile: true,
      },

      reportsDirectory: './coverage',
      reporter: ['text-summary', 'html', 'lcov', 'json'],
      reportOnFailure: true,
    },
  },
})
```

### `packages/common/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'

// NOTE: no `coverage` key here by design — it would be silently ignored.
// Coverage lives only in the root vitest.config.ts.
export default defineConfig({
  test: {
    name: 'common',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
})
```

### `packages/backend/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'

// No `coverage` key — root-only. See vitest.config.ts at the repo root.
export default defineConfig({
  test: {
    name: 'backend',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

### `packages/backend/vitest.setup.ts`
```ts
import { beforeAll } from 'vitest'

// Enforces the SSR-only contract: if any import in @nukesai-pos/backend reaches
// for a browser global, fail fast rather than passing under jsdom-ish leakage.
beforeAll(() => {
  for (const domGlobal of ['window', 'document', 'navigator', 'localStorage']) {
    if (domGlobal in globalThis) {
      throw new Error(
        `@nukesai-pos/backend is server-only but "${domGlobal}" is present in the test environment.`,
      )
    }
  }
})
```

### `packages/frontend/vitest.config.ts`
```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// No `coverage` key — root-only. See vitest.config.ts at the repo root.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'frontend',
    environment: 'jsdom',
    // globals:false keeps published-library discipline (explicit imports, no
    // ambient types). Consequence: RTL's auto-cleanup registers only
    // `if (typeof afterEach === 'function')`, which is FALSE here — so
    // vitest.setup.ts MUST call cleanup() itself (verified: omitting it leaks
    // the DOM across tests).
    globals: false,
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

### `packages/frontend/vitest.setup.ts`
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// REQUIRED because `globals: false` — @testing-library/react@16 only
// self-registers cleanup when a global afterEach exists.
afterEach(() => {
  cleanup()
})
```

### `packages/cli/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'

// No `coverage` key — root-only. See vitest.config.ts at the repo root.
export default defineConfig({
  test: {
    name: 'cli',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
})
```

### `playwright.config.ts`
```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // 'blob' enables `playwright merge-reports` across sharded CI jobs later.
  reporter: process.env.CI
    ? [['github'], ['blob'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
  ],

  webServer: {
    // Production start, NOT dev: E2E exercises the same output Lighthouse would see.
    command: 'pnpm --filter @nukesai-pos/example start',
    url: BASE_URL,
    cwd: import.meta.dirname,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // Dedicated port so it never collides with a developer's `next dev` on 3000.
    env: { PORT: String(PORT), NODE_ENV: 'production' },
  },
})
```

### `e2e/smoke.spec.ts`
```ts
import { expect, test } from '@playwright/test'

test('example app serves the demo page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /nukes pos/i })).toBeVisible()
})
```

### `.size-limit.json`
```json
[
  {
    "name": "common — full entry (ESM)",
    "path": "packages/common/dist/index.js",
    "limit": "8 kB",
    "gzip": true
  },
  {
    "name": "common — single export (tree-shaking proof)",
    "path": "packages/common/dist/index.js",
    "import": "{ formatMoney }",
    "limit": "1.5 kB",
    "gzip": true
  },
  {
    "name": "frontend — client entry (ESM)",
    "path": "packages/frontend/dist/client/index.js",
    "limit": "45 kB",
    "ignore": ["react", "react-dom", "next"],
    "gzip": true
  },
  {
    "name": "frontend — single component (tree-shaking proof)",
    "path": "packages/frontend/dist/client/index.js",
    "import": "{ OrderTicket }",
    "limit": "6 kB",
    "ignore": ["react", "react-dom", "next"],
    "gzip": true
  },
  {
    "name": "backend — server entry (must never reach a browser bundle)",
    "path": "packages/backend/dist/index.js",
    "limit": "60 kB",
    "ignore": ["next", "server-only"],
    "gzip": true
  }
]
```

### `.prettierrc.json`
```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "bracketSpacing": true,
  "endOfLine": "lf",
  "quoteProps": "as-needed",
  "experimentalOperatorPosition": "start",
  "objectWrap": "preserve",
  "plugins": ["prettier-plugin-packagejson"],
  "overrides": [
    {
      "files": ["*.md", "*.mdx"],
      "options": { "proseWrap": "preserve", "embeddedLanguageFormatting": "auto" }
    },
    {
      "files": ["*.yml", "*.yaml"],
      "options": { "singleQuote": false }
    }
  ]
}
```

### `.prettierignore`
```
node_modules
.next
dist
coverage
playwright-report
test-results
e2e/.artifacts
.turbo
pnpm-lock.yaml
*.gen.ts
*.gen.json
CHANGELOG.md
.changeset/*.md
packages/cli/templates
```

### `.lintstagedrc.json`
```json
{
  "*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}": ["prettier --write"],
  "*.{json,jsonc,json5,md,mdx,yml,yaml,css,html}": ["prettier --write"],
  "**/package.json": ["prettier --write"]
}
```
(Prettier only — type-aware ESLint is far too slow for pre-commit; it runs in pre-push and CI where turbo caches it. Keep exactly ONE lint-staged config: v17 discovers configs across all git-tracked paths.)

### `.husky/pre-commit`
```
lint-staged
```

### `.husky/commit-msg`
```
commitlint --edit "$1"
```

### `.husky/pre-push`
```
turbo run check-types lint --output-logs=errors-only
```
(Husky 9 format: no shebang, no `husky.sh` sourcing — both are deprecated and will FAIL in husky 10. Files do not need the executable bit; husky's shim prepends `node_modules/.bin` to PATH.)

### `commitlint.config.js`
```js
/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // config-conventional 21.2.2 types:
    // build chore ci docs feat fix perf refactor revert style test
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        "backend",
        "frontend",
        "common",
        "cli",
        "eslint-config",
        "typescript-config",
        "example",
        "repo",
        "ci",
        "deps",
        "release",
      ],
    ],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "header-max-length": [2, "always", 100],
    // Changesets and release tooling generate long body lines; do not fight them.
    "body-max-line-length": [0, "always", Infinity],
    "footer-max-line-length": [0, "always", Infinity],
  },
};
```

### `.syncpackrc.json`
```json
{
  "versionGroups": [
    {
      "label": "Published internal deps use workspace:^ (publishes as ^x.y.z)",
      "dependencies": ["@nukesai-pos/common", "@nukesai-pos/backend", "@nukesai-pos/frontend"],
      "dependencyTypes": ["prod"],
      "pinVersion": "workspace:^"
    },
    {
      "label": "Internal dev/config deps use workspace:*",
      "dependencies": ["@nukesai-pos/**"],
      "dependencyTypes": ["dev"],
      "pinVersion": "workspace:*"
    },
    {
      "label": "typescript is hand-authored (TS7 root pin + TS6 alias in eslint-config)",
      "dependencies": ["typescript"],
      "isIgnored": true
    },
    {
      "label": "Peer ranges are hand-authored, never synced",
      "dependencyTypes": ["peer"],
      "isIgnored": true
    },
    {
      "label": "Everything else must come from the pnpm catalog",
      "dependencies": ["**"],
      "dependencyTypes": ["prod", "dev"],
      "policy": "catalog"
    }
  ]
}
```
(No `sortAz`/`sortFirst` and never run `syncpack format` — package.json field order belongs to prettier-plugin-packagejson. Top-level `dependencyTypes` is deprecated in v15 and errors; it is only legal inside a group. The root package.json has a `version` field, avoiding v15's InvalidLocalVersion noise.)

### `knip.json`
```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "treatConfigHintsAsErrors": true,
  "workspaces": {
    ".": {
      "entry": [
        "commitlint.config.js",
        "scripts/*.mjs",
        "vitest.config.ts",
        "playwright.config.ts",
        "e2e/**/*.spec.ts"
      ],
      "project": ["scripts/**/*.mjs", "e2e/**/*.ts", "*.{js,ts}"]
    },
    "apps/example": {
      "entry": ["app/**/{page,layout}.tsx", "next.config.ts"],
      "project": ["**/*.{ts,tsx}"]
    },
    "packages/common": {
      "entry": ["src/index.ts!", "src/**/index.ts!", "src/i18n/locales/*.ts!"],
      "project": ["src/**/*.ts!"]
    },
    "packages/backend": {
      "entry": [
        "src/index.ts!",
        "src/ports/index.ts!",
        "src/adapters/demo/index.ts!",
        "src/internal/browser-guard.ts!"
      ],
      "project": ["src/**/*.ts!"]
    },
    "packages/frontend": {
      "entry": ["src/server/index.ts!", "src/client/index.ts!"],
      "project": ["src/**/*.{ts,tsx}!"]
    },
    "packages/cli": {
      "entry": ["src/main.ts!"],
      "project": ["src/**/*.ts!"]
    },
    "packages/eslint-config": {
      "entry": ["base.js", "react.js", "boundaries.js"],
      "project": ["*.js"]
    },
    "packages/typescript-config": {
      "entry": ["*.json"],
      "project": ["*.json"]
    }
  },
  "rules": {
    "files": "error",
    "dependencies": "error",
    "devDependencies": "error",
    "unlisted": "error",
    "binaries": "error",
    "unresolved": "error",
    "exports": "error",
    "types": "error",
    "duplicates": "error",
    "enumMembers": "off",
    "namespaceMembers": "off"
  }
}
```
(`classMembers` does not exist in knip 6 — it warns and ignores. Expect one tuning pass on first run; see Risk #8.)

### `.npmrc` (committed, repo root)
```
# Registry pin ONLY. Deliberately NO _authToken line: npm/pnpm hard-error on an
# unset ${NPM_TOKEN}, and this monorepo installs nothing private (internal deps
# use workspace:). CI writes auth into $HOME/.npmrc; consumers get the template
# from packages/cli/templates/consumer/.npmrc.
@nukesai-pos:registry=https://registry.npmjs.org/
registry=https://registry.npmjs.org/
```

### `.gitignore`
```
node_modules/
dist/
.next/
.turbo/
coverage/
playwright-report/
test-results/
e2e/.artifacts/
*.tsbuildinfo
.env
.env.*
!.env.example
```

### `.vscode/settings.json`
```json
{
  "// tsdk": "TS7 ships no tsserver and no language-service plugins, so the Next.js editor plugin only works on a TS 5/6 tsserver. Point the editor at the TS6 alias that eslint-config carries. CI and builds still use TS 7.0.2.",
  "typescript.tsdk": "packages/eslint-config/node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### `.changeset/config.json`
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.1/schema.json",
  "changelog": ["@changesets/cli/changelog", null],
  "commit": false,
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "bumpVersionsWithWorkspaceProtocolOnly": true,
  "fixed": [
    [
      "@nukesai-pos/common",
      "@nukesai-pos/backend",
      "@nukesai-pos/frontend",
      "@nukesai-pos/cli"
    ]
  ],
  "linked": [],
  "ignore": [],
  "privatePackages": { "version": false, "tag": false },
  "changedFilePatterns": [
    "src/**",
    "package.json",
    "tsdown.config.ts",
    "!**/*.test.ts",
    "!**/*.test.tsx",
    "!**/*.md"
  ]
}
```

### `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  TURBO_TELEMETRY_DISABLED: 1
  NEXT_TELEMETRY_DISABLED: 1
  DO_NOT_TRACK: 1

jobs:
  verify:
    name: Lint, Typecheck, Test, Build, Package
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Restore Turborepo cache
        uses: actions/cache@v6
        with:
          path: .turbo/cache
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify dependency version alignment (catalog policy)
        run: pnpm syncpack:lint

      - name: Check formatting
        run: pnpm format:check

      - name: Lint
        run: pnpm turbo run lint

      - name: Typecheck (TypeScript 7)
        run: pnpm turbo run check-types

      - name: Build packages (includes publint + attw gates)
        run: pnpm turbo run build

      - name: Assert build did not rewrite any package.json
        run: git diff --exit-code -- 'packages/*/package.json'

      - name: Unit tests with 100% coverage gate
        run: pnpm test

      - name: Prove the coverage gate can fail
        run: pnpm coverage:canary

      - name: Bundle-size and tree-shaking budgets
        run: pnpm size

      - name: Detect unused files, deps and exports
        run: pnpm knip

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: coverage
          path: coverage/
          retention-days: 7

  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Setup Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Restore Turborepo cache
        uses: actions/cache@v6
        with:
          path: .turbo/cache
          key: turbo-e2e-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-e2e-${{ runner.os }}-
            turbo-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v6
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: pnpm exec playwright install --with-deps chromium webkit

      - name: Install Playwright OS dependencies
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: pnpm exec playwright install-deps chromium webkit

      - name: Build workspace
        run: pnpm turbo run build

      - name: Run E2E tests
        run: pnpm e2e

      - name: Upload Playwright report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### `.github/workflows/release.yml`
```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions: {}

env:
  TURBO_TELEMETRY_DISABLED: 1
  # Provenance is structurally impossible for restricted packages
  # (libnpmpublish throws unless access is public). Fail closed.
  NPM_CONFIG_PROVENANCE: "false"

jobs:
  release:
    name: Version or Publish
    runs-on: ubuntu-latest
    timeout-minutes: 25
    environment: release
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Setup Node.js
        # Deliberately NO registry-url here — we write $HOME/.npmrc ourselves so
        # nothing can shadow it mid-publish.
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Restore Turborepo cache
        uses: actions/cache@v6
        with:
          path: .turbo/cache
          key: turbo-release-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-release-${{ runner.os }}-
            turbo-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # Single quotes are load-bearing: the literal string ${NPM_TOKEN} must land
      # in the file. npm/pnpm expand it from the environment at read time, so the
      # token is never written to disk.
      - name: Configure npm registry auth
        run: |
          printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > "$HOME/.npmrc"
          printf '@nukesai-pos:registry=https://registry.npmjs.org/\n' >> "$HOME/.npmrc"

      - name: Create release PR or publish to npm
        id: changesets
        # v2 is required for @changesets/cli 3.x; v1 inputs (version:/publish:)
        # are silently ignored by v2 — these are the kebab-case v2 inputs.
        uses: changesets/action@v2.1.1
        with:
          version-script: pnpm run version-packages
          publish-script: pnpm run release
          commit-message: "chore(release): version packages"
          pr-title: "chore(release): version packages"
          create-github-releases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: "false"

      - name: Summarise published packages
        if: steps.changesets.outputs.published == 'true'
        run: |
          {
            echo '### Published to npm (restricted)'
            echo '```json'
            echo '${{ steps.changesets.outputs.published-packages }}'
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
```

### `scripts/assert-coverage-gate-fails.mjs`
```js
// Proves the 100% coverage gate is real. Writes a deliberately untested source
// file, asserts `vitest run --coverage` FAILS, then removes it. Catches the
// Vitest 4 trap where a missing `coverage.include` yields a fraudulent 100%.
import { execSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const canary = 'packages/common/src/money/__coverage_canary__.ts'
writeFileSync(canary, 'export const canary = (): string => "untested"\n')

let failedAsExpected = false
try {
  execSync('pnpm exec vitest run --coverage', { stdio: 'ignore' })
} catch {
  failedAsExpected = true
} finally {
  rmSync(canary, { force: true })
}

if (!failedAsExpected) {
  console.error(
    'COVERAGE GATE IS BROKEN: an untested file did not fail the build.\n' +
      'Most likely `coverage.include` is missing from the root vitest.config.ts.',
  )
  process.exit(1)
}
console.log('Coverage gate verified: untested code fails the build.')
```

### `LICENSE` (root; copied verbatim into each published package directory)
```
PROPRIETARY SOFTWARE LICENSE

Copyright (c) 2026 Nukes AI & Software Solution <info@nukesai.com>
All rights reserved.

1. DEFINITIONS
   "Software" means this package, its source code, compiled artifacts,
   type declarations, documentation and any accompanying assets.
   "Licensor" means Nukes AI & Software Solution.
   "Licensee" means the individual or legal entity that has entered into a
   valid, current, written commercial agreement with the Licensor covering
   the Software.

2. GRANT
   Subject to a valid written agreement with the Licensor and to full payment
   of all applicable fees, the Licensor grants the Licensee a non-exclusive,
   non-transferable, non-sublicensable, revocable licence to install and use
   the Software in object and source form solely for the Licensee's internal
   business purposes and solely for the deployments identified in that
   agreement.

3. RESTRICTIONS
   Except to the extent expressly permitted by that written agreement or by
   mandatory applicable law, the Licensee shall not:
   (a) copy, publish, distribute, sublicense, sell, rent, lease, lend or
       otherwise make the Software available to any third party;
   (b) create derivative works of, modify, translate or adapt the Software;
   (c) reverse engineer, decompile or disassemble the Software;
   (d) remove, obscure or alter any copyright, trademark or other proprietary
       notice contained in the Software;
   (e) use the Software to build, train or evaluate a competing product or
       service.

4. NO OPEN SOURCE LICENCE
   The Software is NOT open source and is NOT free software. Publication of
   the Software to a package registry under restricted access does not grant
   any licence beyond that described in Section 2. Any use without a valid
   written agreement with the Licensor is unauthorised and infringing.

5. OWNERSHIP
   The Software is licensed, not sold. The Licensor retains all right, title
   and interest in and to the Software, including all intellectual property
   rights therein.

6. TERMINATION
   This licence terminates automatically and immediately, without notice, on
   any breach of these terms or on termination or expiry of the applicable
   written agreement. On termination the Licensee shall cease all use of the
   Software and destroy all copies in its possession or control.

7. NO WARRANTY
   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NONINFRINGEMENT.

8. LIMITATION OF LIABILITY
   TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE
   LICENSOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
   PUNITIVE OR CONSEQUENTIAL DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE,
   DATA OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THE SOFTWARE OR ITS
   USE, WHETHER IN CONTRACT, TORT OR OTHERWISE, EVEN IF ADVISED OF THE
   POSSIBILITY OF SUCH DAMAGES.

9. GOVERNING LAW
   This licence is governed by the laws of the jurisdiction in which the
   Licensor is established, without regard to its conflict of law provisions.

For licensing enquiries contact: info@nukesai.com
```

---

### `packages/typescript-config/package.json`
```json
{
  "name": "@nukesai-pos/typescript-config",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED"
}
```

### `packages/typescript-config/base.json`
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "@nukesai-pos/typescript-config/base",
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2023"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,

    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true,
    "skipLibCheck": true,
    "incremental": true
  },
  "exclude": ["node_modules", "dist", ".next", "coverage", "**/*.tsbuildinfo"]
}
```
(Every TS7-changed default is pinned so the preset is version-independent. No `tsBuildInfoFile` — it resolves relative to the file that declares it, verified; `*.tsbuildinfo` is gitignored.)

### `packages/typescript-config/library.json`
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "@nukesai-pos/typescript-config/library",
  "extends": "./base.json",
  "compilerOptions": {
    "isolatedDeclarations": true
  },
  "include": ["src/**/*.ts"]
}
```
(`isolatedDeclarations: true` is the load-bearing line — it forces tsdown onto the stable oxc dts generator instead of the experimental tsgo one. Emission itself is tsdown's job; per-package tsconfigs stay `noEmit` and widen `include` to cover tests.)

### `packages/typescript-config/react-library.json`
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "@nukesai-pos/typescript-config/react-library",
  "extends": "./library.json",
  "compilerOptions": {
    "lib": ["es2023", "dom", "dom.iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": ["react"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

### `packages/typescript-config/nextjs.json`
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "@nukesai-pos/typescript-config/nextjs",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["es2023", "dom", "dom.iterable"],
    "module": "esnext",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "allowJs": true,
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "erasableSyntaxOnly": false,
    "types": ["node", "react"],
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules", ".next", "dist"]
}
```
(jsx and include are pre-set to Next 16.3's tsconfig fixed point — verified that `next typegen` then leaves the file byte-identical. The `plugins` entry is inert under TS7 and active when the editor uses the TS6 tsdk.)

---

### `packages/eslint-config/package.json`
```json
{
  "name": "@nukesai-pos/eslint-config",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "exports": {
    "./base": "./base.js",
    "./react": "./react.js",
    "./boundaries": "./boundaries.js"
  },
  "dependencies": {
    "@eslint/js": "catalog:",
    "@next/eslint-plugin-next": "catalog:",
    "eslint-config-prettier": "catalog:",
    "eslint-import-resolver-typescript": "catalog:",
    "eslint-plugin-import-x": "catalog:",
    "eslint-plugin-react-hooks": "catalog:",
    "eslint-plugin-turbo": "catalog:",
    "globals": "catalog:",
    "typescript-eslint": "catalog:"
  },
  "devDependencies": {
    "eslint": "catalog:",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  },
  "peerDependencies": {
    "eslint": "^10.0.0"
  }
}
```
(THE HYBRID: the `npm:` alias is scoped to this package only, so typescript-eslint gets the TS6 JS API while the rest of the monorepo runs TS 7.0.2. Verified in a real pnpm workspace: estree resolves @typescript/typescript6@6.0.2, root `.bin/tsc` stays 7.0.2, zero peer warnings, no bin collision — typescript6's bin is `tsc6`.)

### `packages/eslint-config/base.js`
```js
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import turbo from "eslint-plugin-turbo";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared strict, type-aware base config. Exported as a FACTORY so each package
 * passes its own tsconfigRootDir — this is what makes projectService work
 * correctly per-package in a monorepo.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir - pass `import.meta.dirname`
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function createBaseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      name: "nukes/ignores",
      ignores: [
        "**/dist/**",
        "**/.next/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/node_modules/**",
        "**/templates/**",
        "**/*.gen.ts",
      ],
    },

    { name: "nukes/js-recommended", ...js.configs.recommended },
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    turbo.configs["flat/recommended"],

    {
      name: "nukes/language-options",
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        parserOptions: {
          projectService: {
            allowDefaultProject: ["*.js", "*.mjs", "*.cjs"],
            defaultProject: "tsconfig.json",
          },
          tsconfigRootDir,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: "error",
        reportUnusedInlineConfigs: "error",
      },
    },

    {
      name: "nukes/library-rules",
      files: ["**/*.{ts,tsx,mts,cts}"],
      rules: {
        // --- published-package hygiene (tree-shaking + d.ts correctness) ---
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: true },
        ],
        "@typescript-eslint/consistent-type-exports": [
          "error",
          { fixMixedExportsWithInlineTypeSpecifier: true },
        ],
        "@typescript-eslint/no-import-type-side-effects": "error",
        // Also the authoring aid for isolatedDeclarations (TS9013).
        "@typescript-eslint/explicit-module-boundary-types": "error",

        // --- correctness ---
        "@typescript-eslint/no-floating-promises": ["error", { checkThenables: true }],
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/promise-function-async": "error",
        "@typescript-eslint/require-await": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],

        // --- house style ---
        "no-console": ["error", { allow: ["warn", "error"] }],
        "no-restricted-syntax": [
          "error",
          {
            selector: "TSEnumDeclaration",
            message:
              "Use a const object + union type. Enums are not erasable and break erasableSyntaxOnly/tsdown output.",
          },
        ],
      },
    },

    // Plain JS (config files, scripts) must opt OUT of type-aware rules.
    {
      name: "nukes/js-untyped",
      files: ["**/*.{js,mjs,cjs}"],
      languageOptions: { globals: globals.node },
      extends: [tseslint.configs.disableTypeChecked],
    },

    {
      name: "nukes/tests",
      files: ["**/*.{test,spec}.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },

    // MUST be last: turns off everything Prettier owns.
    prettier,
  );
}

export default createBaseConfig;
```

### `packages/eslint-config/react.js`
```js
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import { createBaseConfig } from "./base.js";

/**
 * React + Next layer. Exact config paths matter:
 * - reactHooks.configs.flat.recommended (NOT .configs.recommended — that is the
 *   legacy eslintrc shape and breaks flat config). Ships the bundled React
 *   Compiler rules under the react-hooks/ namespace.
 * - nextPlugin.configs['core-web-vitals'] is ALREADY flat in 16.3.1.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function createReactConfig({ tsconfigRootDir }) {
  return tseslint.config(
    ...createBaseConfig({ tsconfigRootDir }),

    {
      name: "nukes/react-globals",
      files: ["**/*.{ts,tsx}"],
      languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
    },

    {
      name: "nukes/react-hooks",
      files: ["**/*.{ts,tsx}"],
      ...reactHooks.configs.flat.recommended,
    },

    {
      name: "nukes/next",
      files: ["**/*.{ts,tsx}"],
      ...nextPlugin.configs["core-web-vitals"],
    },

    {
      name: "nukes/next-overrides",
      files: ["**/*.{ts,tsx}"],
      rules: {
        // App-router-only repo: this rule prints "Pages directory cannot be
        // found" on every single lint run. Verified.
        "@next/next/no-html-link-for-pages": "off",
      },
    },
  );
}

export default createReactConfig;
```

### `packages/eslint-config/boundaries.js`
```js
/**
 * @nukesai-pos/eslint-config/boundaries
 *
 * SSR/CSR isolation rules. Consumed per-package because `no-restricted-paths`
 * needs an absolute `basePath` pointing at THAT package, not at this config.
 *
 *   // packages/backend/eslint.config.js
 *   import { boundaries } from "@nukesai-pos/eslint-config/boundaries";
 *   export default [...boundaries({ packageDir: import.meta.dirname, zone: "server" })];
 */
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

/** Bare + `node:`-prefixed builtins. `no-restricted-imports` matches specifier strings. */
export const NODE_BUILTINS = [
  "node:*", "assert", "async_hooks", "buffer", "child_process", "cluster",
  "console", "constants", "crypto", "dgram", "dns", "domain", "events", "fs",
  "fs/*", "http", "http2", "https", "inspector", "module", "net", "os", "path",
  "path/*", "perf_hooks", "process", "punycode", "querystring", "readline",
  "repl", "stream", "stream/*", "string_decoder", "timers", "timers/*", "tls",
  "trace_events", "tty", "url", "util", "util/*", "v8", "vm", "worker_threads", "zlib",
];

const SERVER_PKGS = ["@nukesai-pos/backend", "@nukesai-pos/backend/**"];
const DOM_GLOBALS = ["window", "document", "navigator", "localStorage", "sessionStorage", "location", "history"];

const DOC = "See docs/architecture/isolation.md.";

/** Shared resolver so `no-restricted-paths` can follow `./x.js` -> `./x.ts`.
 *  REQUIRED: with the default node resolver the zone rule silently passes. */
const tsResolver = (packageDir) => ({
  "import-x/resolver-next": [
    createTypeScriptImportResolver({
      project: `${packageDir}/tsconfig.json`,
      alwaysTryTypes: true,
    }),
  ],
});

/** Directory zones, enforced on RESOLVED paths. */
export const zoneConfig = ({ packageDir }) => ({
  name: "nukes/boundary/zones",
  files: ["src/**/*.{ts,tsx}"],
  plugins: { "import-x": importX },
  settings: tsResolver(packageDir),
  rules: {
    "import-x/no-unresolved": "error",
    "import-x/no-restricted-paths": [
      "error",
      {
        basePath: packageDir,
        zones: [
          {
            target: "./src/client",
            from: "./src/server",
            message: `client/** must never import server/**. ${DOC}`,
          },
        ],
      },
    ],
  },
});

/** Server-graph rules (RSC/Node only). */
export const serverZone = {
  name: "nukes/boundary/server",
  files: ["src/server/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["client-only", "react-dom/client", "**/client/**", "*.client", "*.client.*"],
            message: `server code must not import client code. ${DOC}`,
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...DOM_GLOBALS.map((name) => ({ name, message: `server code has no DOM. ${DOC}` })),
    ],
  },
};

/** Client-graph rules (ships to the browser). */
export const clientZone = {
  name: "nukes/boundary/client",
  files: ["src/client/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [...SERVER_PKGS, "server-only", "**/server/**", "*.server", "*.server.*"],
            message: `Client code must never import @nukesai-pos/backend or any server module. ${DOC}`,
          },
          {
            group: NODE_BUILTINS,
            message: `Node builtins do not exist in the browser. ${DOC}`,
          },
        ],
      },
    ],
  },
};

/** Isomorphic rules — must be byte-identical-safe on both sides. */
export const isomorphicZone = {
  name: "nukes/boundary/isomorphic",
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: NODE_BUILTINS, message: `@nukesai-pos/common is isomorphic: no Node builtins. ${DOC}` },
          {
            group: [...SERVER_PKGS, "@nukesai-pos/frontend", "@nukesai-pos/frontend/**", "server-only", "client-only"],
            message: `@nukesai-pos/common is a leaf package and imports neither sibling nor a runtime pin. ${DOC}`,
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...[...DOM_GLOBALS, "process", "global", "__dirname", "__filename"].map((name) => ({
        name,
        message: `isomorphic code must not touch runtime-specific globals; inject instead. ${DOC}`,
      })),
    ],
    "no-restricted-properties": [
      "error",
      { object: "process", property: "env", message: `isomorphic code must not read process.env; take config as a parameter. ${DOC}` },
    ],
  },
};

/**
 * @param {{ packageDir: string, zone: "server" | "client" | "isomorphic" | "mixed" }} opts
 * @returns {import("eslint").Linter.Config[]}
 */
export function boundaries({ packageDir, zone }) {
  const base = [zoneConfig({ packageDir })];
  switch (zone) {
    case "server":
      // Whole package is server code, not just src/server/**.
      return [...base, { ...serverZone, files: ["src/**/*.{ts,tsx}"] }];
    case "client":
      return [...base, { ...clientZone, files: ["src/**/*.{ts,tsx}"] }];
    case "isomorphic":
      return [...base, isomorphicZone];
    case "mixed":
      return [...base, serverZone, clientZone];
    default:
      throw new Error(`Unknown zone: ${String(zone)}`);
  }
}
```

---

### `packages/common/package.json`
```json
{
  "name": "@nukesai-pos/common",
  "version": "0.0.0",
  "private": false,
  "description": "Shared i18n, types, schemas, constants and runtime guards for the Nukes AI POS platform. Safe on both server and client.",
  "keywords": ["point-of-sale", "pos", "restaurant", "nukesai"],
  "bugs": {
    "email": "info@nukesai.com"
  },
  "license": "UNLICENSED",
  "author": {
    "name": "Nukes AI & Software Solution",
    "email": "info@nukesai.com"
  },
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts",
      "default": "./dist/types/index.js"
    },
    "./constants": {
      "types": "./dist/constants/index.d.ts",
      "default": "./dist/constants/index.js"
    },
    "./schemas": {
      "types": "./dist/schemas/index.d.ts",
      "default": "./dist/schemas/index.js"
    },
    "./i18n": {
      "types": "./dist/i18n/index.d.ts",
      "default": "./dist/i18n/index.js"
    },
    "./i18n/locales/*": {
      "types": "./dist/i18n/locales/*.d.ts",
      "default": "./dist/i18n/locales/*.js"
    },
    "./runtime": {
      "types": "./dist/runtime/index.d.ts",
      "default": "./dist/runtime/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src", "README.md", "LICENSE", "CHANGELOG.md"],
  "scripts": {
    "build": "tsdown",
    "check-types": "tsc --noEmit",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@nukesai-pos/eslint-config": "workspace:*",
    "@nukesai-pos/typescript-config": "workspace:*",
    "@arethetypeswrong/core": "catalog:",
    "eslint": "catalog:",
    "publint": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "publishConfig": {
    "access": "restricted",
    "registry": "https://registry.npmjs.org/",
    "tag": "latest",
    "provenance": false
  },
  "engines": {
    "node": ">=20.19.0"
  }
}
```

### `packages/common/tsdown.config.ts`
```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@nukesai-pos/common',
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
    'constants/index': 'src/constants/index.ts',
    'schemas/index': 'src/schemas/index.ts',
    'i18n/index': 'src/i18n/index.ts',
    'runtime/index': 'src/runtime/index.ts',
    // Glob key: one file per locale so importing `ne` never pays for `en`.
    'i18n/locales/*': './src/i18n/locales/*.ts',
  },
  // Pins the dist layout so the hand-written exports map cannot drift.
  root: 'src',
  format: 'esm',
  // Isomorphic: must not assume Node builtins.
  platform: 'neutral',
  target: 'es2022',
  // Force the stable oxc generator; never fall back to the experimental tsgo
  // one that tsdown auto-selects when typescript@7 is installed.
  dts: { generator: 'oxc', sourcemap: true },
  // Mirrors src/ into dist/ -> per-module tree-shaking and lazy import()
  // splitting in the consumer app.
  unbundle: true,
  // tsdown defaults hash:true; stable filenames are required by the exports map.
  hash: false,
  // `"type": "module"` + plain .js, not .mjs.
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  // Never inline anything from node_modules into a library.
  // (`external`/`noExternal` are deprecated in tsdown 0.22.x.)
  deps: { neverBundle: true },
  // Exports map is hand-written and reviewed; tsdown must not rewrite
  // package.json (its generator omits `types` conditions).
  exports: false,
  publint: true,
  // Exact literal is 'esm-only' (hyphenated); 'esmOnly' silently no-ops.
  attw: { profile: 'esm-only', level: 'error' },
  report: true,
  failOnWarn: 'ci-only',
})
```

### `packages/common/eslint.config.js`
```js
import { createBaseConfig } from "@nukesai-pos/eslint-config/base";
import { boundaries } from "@nukesai-pos/eslint-config/boundaries";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "isomorphic" }),
];
```

### `packages/common/tsconfig.json`
```json
{
  "extends": "@nukesai-pos/typescript-config/library.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src/**/*.ts", "tsdown.config.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### `packages/common/src/runtime/guard.ts`
```ts
export type Runtime = "server" | "client";

/**
 * The only environment sniff in the codebase. Checks `window.document` as well
 * as `window` so a Node global-shim does not read as a browser.
 */
const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.document !== "undefined";

export const currentRuntime = (): Runtime => (isBrowser() ? "client" : "server");

export class RuntimeBoundaryError extends Error {
  override readonly name = "RuntimeBoundaryError";

  constructor(expected: Runtime, moduleId: string) {
    super(
      `[@nukesai-pos] Runtime boundary violated: "${moduleId}" is ${expected}-only ` +
        `but was evaluated in the ${expected === "server" ? "client" : "server"} runtime. ` +
        `This means a build-time guard was bypassed. See docs/architecture/isolation.md.`,
    );
  }
}

/**
 * Call at module scope in server-only modules, immediately after
 * `import "server-only"`. The import is the build-time gate; this is the
 * runtime net.
 */
export function assertServerRuntime(moduleId: string): void {
  if (isBrowser()) throw new RuntimeBoundaryError("server", moduleId);
}

/** Mirror of the above for browser-only modules (e.g. anything touching IndexedDB). */
export function assertClientRuntime(moduleId: string): void {
  if (!isBrowser()) throw new RuntimeBoundaryError("client", moduleId);
}
```
(`src/runtime/index.ts` is a pure re-export barrel: `export * from "./guard.js"` — the barrel/logic split keeps the `**/index.ts` coverage exclusion truthful. Note: this file deliberately references `window` via `typeof` guards only; it carries an eslint-disable for the isomorphic `no-restricted-globals` rule with a justification comment.)

---

### `packages/backend/package.json`
```json
{
  "name": "@nukesai-pos/backend",
  "version": "0.0.0",
  "private": false,
  "description": "Nukes AI POS server-side business logic and data-access ports. SERVER ONLY.",
  "keywords": ["point-of-sale", "pos", "restaurant", "nukesai"],
  "bugs": {
    "email": "info@nukesai.com"
  },
  "license": "UNLICENSED",
  "author": {
    "name": "Nukes AI & Software Solution",
    "email": "info@nukesai.com"
  },
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "browser": "./dist/_browser_guard.js",
      "default": "./dist/index.js"
    },
    "./ports": {
      "types": "./dist/ports/index.d.ts",
      "default": "./dist/ports/index.js"
    },
    "./adapters/demo": {
      "types": "./dist/adapters/demo/index.d.ts",
      "browser": "./dist/_browser_guard.js",
      "default": "./dist/adapters/demo/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src", "README.md", "LICENSE", "CHANGELOG.md"],
  "scripts": {
    "build": "tsdown",
    "check-types": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@nukesai-pos/common": "workspace:^",
    "server-only": "catalog:"
  },
  "peerDependencies": {
    "next": "^16.3.0"
  },
  "devDependencies": {
    "@nukesai-pos/eslint-config": "workspace:*",
    "@nukesai-pos/typescript-config": "workspace:*",
    "@arethetypeswrong/core": "catalog:",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "next": "catalog:",
    "publint": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "publishConfig": {
    "access": "restricted",
    "registry": "https://registry.npmjs.org/",
    "tag": "latest",
    "provenance": false
  },
  "engines": {
    "node": ">=20.19.0"
  }
}
```
(Deliberately NO react/react-dom peers — that omission is the package.json-level enforcement of "backend never renders UI".)

### `packages/backend/tsdown.config.ts`
```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@nukesai-pos/backend',
  entry: {
    index: 'src/index.ts',
    'ports/index': 'src/ports/index.ts',
    'adapters/demo/index': 'src/adapters/demo/index.ts',
    // Throws on import; wired into guarded exports via the "browser" condition.
    _browser_guard: 'src/internal/browser-guard.ts',
  },
  root: 'src',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  dts: { generator: 'oxc', sourcemap: true },
  // Keeps the adapter/port boundary 1:1 with dist so a driver can be swapped
  // later, and preserves the `import "server-only"` lines per file.
  unbundle: true,
  hash: false,
  // platform:'node' defaults fixedExtension to true (.mjs); we want plain .js.
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  // Keep `node:` prefixes explicit on builtins.
  nodeProtocol: true,
  deps: { neverBundle: true },
  exports: false,
  publint: true,
  attw: { profile: 'esm-only', level: 'error' },
  report: true,
  failOnWarn: 'ci-only',
})
```

### `packages/backend/eslint.config.js`
```js
import { createBaseConfig } from "@nukesai-pos/eslint-config/base";
import { boundaries } from "@nukesai-pos/eslint-config/boundaries";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "server" }),
  {
    name: "backend/no-ui",
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "@nukesai-pos/backend never renders UI." },
            { name: "react-dom", message: "@nukesai-pos/backend never renders UI." },
          ],
          patterns: [
            {
              group: ["@nukesai-pos/frontend", "@nukesai-pos/frontend/**", "react/*", "react-dom/*"],
              message: "@nukesai-pos/backend never imports UI code.",
            },
          ],
        },
      ],
    },
  },
];
```

### `packages/backend/tsconfig.json`
```json
{
  "extends": "@nukesai-pos/typescript-config/library.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "tsdown.config.ts", "vitest.config.ts", "vitest.setup.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### `packages/backend/src/internal/browser-guard.ts`
```ts
// Resolved by the "browser" export condition. Reaching this module means a
// client component imported a server-only entry point.
//
// Verified behaviour (Next 16.3.1 / Turbopack): the build fails with
//   Export <name> doesn't exist in target module .../_browser_guard.js [app-client]
// and the real server module is absent from .next/static.
throw new Error(
  '[@nukesai-pos/backend] This module is server-only and cannot be imported ' +
    'from a Client Component. Import UI from "@nukesai-pos/frontend/client", ' +
    'or move the call into a Server Component / Route Handler.',
)

export {}
```

### `packages/backend/test/boundary.dist.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.join(import.meta.dirname, '..', 'dist')

const files = async (pattern: string): Promise<string[]> =>
  (await Array.fromAsync(glob(pattern, { cwd: DIST }))).sort()
const read = (f: string): string => readFileSync(path.join(DIST, f), 'utf8')

const USE_CLIENT = /^\s*["']use client["'];/m
const SERVER_ONLY = /import\s*["']server-only["']/

describe('backend dist boundary contract', () => {
  it('emits the browser guard, its types, and the guard throws', () => {
    expect(existsSync(path.join(DIST, '_browser_guard.js'))).toBe(true)
    expect(existsSync(path.join(DIST, 'index.d.ts'))).toBe(true)
    expect(read('_browser_guard.js')).toContain('server-only and cannot be imported')
  })

  it('guarded entries keep their server-only poison pill', () => {
    for (const file of ['index.js', 'adapters/demo/index.js']) {
      expect(read(file), `${file} lost its import "server-only"`).toMatch(SERVER_ONLY)
    }
  })

  it('no chunk is ever marked "use client"', async () => {
    const all = await files('**/*.js')
    expect(all.length).toBeGreaterThan(0)
    for (const file of all) {
      expect(read(file), `${file} is wrongly marked as a client module`).not.toMatch(USE_CLIENT)
    }
  })
})
```

---

### `packages/frontend/package.json`
```json
{
  "name": "@nukesai-pos/frontend",
  "version": "0.0.0",
  "private": false,
  "description": "Nukes AI POS admin panel UI (RSC + client components).",
  "keywords": ["point-of-sale", "pos", "restaurant", "nukesai"],
  "bugs": {
    "email": "info@nukesai.com"
  },
  "license": "UNLICENSED",
  "author": {
    "name": "Nukes AI & Software Solution",
    "email": "info@nukesai.com"
  },
  "type": "module",
  "sideEffects": ["**/*.css"],
  "exports": {
    "./server": {
      "types": "./dist/server/index.d.ts",
      "default": "./dist/server/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    },
    "./styles.css": "./styles.css",
    "./package.json": "./package.json"
  },
  "files": ["dist", "src", "styles.css", "README.md", "LICENSE", "CHANGELOG.md"],
  "scripts": {
    "build": "tsdown",
    "check-types": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@nukesai-pos/common": "workspace:^",
    "server-only": "catalog:"
  },
  "peerDependencies": {
    "next": "^16.3.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@nukesai-pos/eslint-config": "workspace:*",
    "@nukesai-pos/typescript-config": "workspace:*",
    "@arethetypeswrong/core": "catalog:",
    "@testing-library/dom": "catalog:",
    "@testing-library/jest-dom": "catalog:",
    "@testing-library/react": "catalog:",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@vitejs/plugin-react": "catalog:",
    "eslint": "catalog:",
    "jsdom": "catalog:",
    "next": "catalog:",
    "publint": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "publishConfig": {
    "access": "restricted",
    "registry": "https://registry.npmjs.org/",
    "tag": "latest",
    "provenance": false
  },
  "engines": {
    "node": ">=20.19.0"
  }
}
```
(NO root `.` export — the SSR/CSR boundary is un-violatable by construction: no import specifier yields both halves.)

### `packages/frontend/tsdown.config.ts`
```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@nukesai-pos/frontend',
  entry: {
    'server/index': 'src/server/index.ts',
    'client/index': 'src/client/index.ts',
  },
  root: 'src',
  format: 'esm',
  // Runs in the RSC layer (node) AND in the browser -> no runtime assumptions.
  platform: 'neutral',
  target: 'es2022',
  dts: { generator: 'oxc', sourcemap: true },

  // -------------------------------------------------------------------------
  // MANDATORY. rolldown preserves `"use client"` / `"use server"` ONLY in
  // unbundle mode. With unbundle:false the directive is silently dropped and
  // the CONSUMER's `next build` fails with:
  //   "You're importing a module that depends on useState into a
  //    React Server Component module."
  // There is NO `preserveDirectives` option in tsdown/rolldown.
  // Enforced post-build by test/boundary.dist.test.ts.
  // -------------------------------------------------------------------------
  unbundle: true,

  hash: false,
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  deps: { neverBundle: true },
  exports: false,
  publint: true,
  attw: {
    profile: 'esm-only',
    level: 'error',
    // attw reports "No resolution" for non-JS subpaths like ./styles.css.
    excludeEntrypoints: [/\.css$/],
  },
  report: true,
  failOnWarn: 'ci-only',
})
```

### `packages/frontend/eslint.config.js`
```js
import { createReactConfig } from "@nukesai-pos/eslint-config/react";
import { boundaries } from "@nukesai-pos/eslint-config/boundaries";

export default [
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "mixed" }),
  {
    name: "frontend/no-directive-on-barrels",
    files: ["src/**/index.ts", "src/**/index.tsx"],
    rules: {
      // A "use client" barrel becomes a single client boundary and leaks every
      // unused export into the consumer's client bundle (verified). Leaves only.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement > Literal[value='use client']",
          message:
            "Never put \"use client\" on a barrel/index file — it drags the whole package into the consumer's client bundle. Mark the leaf component instead.",
        },
        {
          selector: "TSEnumDeclaration",
          message:
            "Use a const object + union type. Enums are not erasable and break erasableSyntaxOnly/tsdown output.",
        },
      ],
    },
  },
];
```

### `packages/frontend/tsconfig.json`
```json
{
  "extends": "@nukesai-pos/typescript-config/react-library.json",
  "compilerOptions": {
    "types": ["react", "node"]
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "test/**/*.ts",
    "tsdown.config.ts",
    "vitest.config.ts",
    "vitest.setup.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

### `packages/frontend/styles.css`
```css
/* Consumer usage:  @import "@nukesai-pos/frontend/styles.css";
 *
 * Tailwind v4 ignores node_modules by default, so the package registers its own
 * built output as a scan source. Paths in @source are resolved relative to the
 * stylesheet that contains them (verified against tailwindcss 4.x through pnpm
 * symlinks).
 */
@source "./dist";
```

### `packages/frontend/test/boundary.dist.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import path from 'node:path'

const DIST = path.join(import.meta.dirname, '..', 'dist')

const files = async (pattern: string): Promise<string[]> =>
  (await Array.fromAsync(glob(pattern, { cwd: DIST }))).sort()
const read = (f: string): string => readFileSync(path.join(DIST, f), 'utf8')
const isBarrel = (f: string): boolean => path.basename(f) === 'index.js'

const NODE_BUILTIN = /\bfrom\s*["'](?:node:|fs["']|path["']|crypto["']|child_process["']|os["']|net["']|tls["'])/
const USE_CLIENT = /^\s*["']use client["'];/m
const SERVER_ONLY = /import\s*["']server-only["']/

describe('frontend dist boundary contract', () => {
  it('every client leaf chunk keeps its "use client" directive', async () => {
    const leaves = (await files('client/**/*.js')).filter((f) => !isBarrel(f))
    // Guards against the glob silently matching nothing (vacuous pass).
    expect(leaves.length).toBeGreaterThan(0)
    for (const file of leaves) {
      expect(read(file), `${file} lost its "use client" directive during bundling`).toMatch(
        USE_CLIENT,
      )
    }
  })

  it('no barrel carries "use client" (it would leak unused exports to the client bundle)', async () => {
    const barrels = (await files('**/*.js')).filter(isBarrel)
    expect(barrels.length).toBeGreaterThan(0)
    for (const file of barrels) {
      expect(read(file), `FORBIDDEN "use client" on barrel: ${file}`).not.toMatch(USE_CLIENT)
    }
  })

  it('no client chunk imports server-only or a node builtin', async () => {
    for (const file of await files('client/**/*.js')) {
      const src = read(file)
      expect(src, `${file} imports server-only`).not.toMatch(SERVER_ONLY)
      expect(src, `${file} imports a node builtin`).not.toMatch(NODE_BUILTIN)
    }
  })

  it('no server chunk is marked "use client", and the server entry keeps its poison pill', async () => {
    const serverFiles = await files('server/**/*.js')
    expect(serverFiles.length).toBeGreaterThan(0)
    for (const file of serverFiles) {
      expect(read(file), `${file} is wrongly marked as a client module`).not.toMatch(USE_CLIENT)
    }
    expect(read('server/index.js'), 'server/index.js lost import "server-only"').toMatch(
      SERVER_ONLY,
    )
  })
})
```

---

### `packages/cli/package.json`
```json
{
  "name": "@nukesai-pos/cli",
  "version": "0.0.0",
  "private": false,
  "description": "Scaffold Nukes POS into an existing Next.js 16 application.",
  "keywords": ["point-of-sale", "pos", "restaurant", "nukesai", "cli"],
  "bugs": {
    "email": "info@nukesai.com"
  },
  "license": "UNLICENSED",
  "author": {
    "name": "Nukes AI & Software Solution",
    "email": "info@nukesai.com"
  },
  "type": "module",
  "sideEffects": false,
  "bin": {
    "nukes-pos": "./dist/main.js"
  },
  "exports": {
    "./package.json": "./package.json"
  },
  "files": ["dist", "templates", "README.md", "LICENSE", "CHANGELOG.md"],
  "scripts": {
    "build": "tsdown",
    "check-types": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@clack/prompts": "catalog:",
    "commander": "catalog:",
    "comment-json": "catalog:",
    "diff": "catalog:",
    "magicast": "catalog:",
    "picocolors": "catalog:",
    "tinyglobby": "catalog:"
  },
  "devDependencies": {
    "@nukesai-pos/eslint-config": "workspace:*",
    "@nukesai-pos/typescript-config": "workspace:*",
    "@arethetypeswrong/core": "catalog:",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "publint": "catalog:",
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "publishConfig": {
    "access": "restricted",
    "registry": "https://registry.npmjs.org/",
    "tag": "latest",
    "provenance": false
  },
  "engines": {
    "node": ">=20.19.0"
  }
}
```
(commander pinned to 14.x — commander 15 requires node >=22.12 while Next 16 supports >=20.9, so 15 would reject valid consumer environments. ESM-only because @clack/prompts ships no CJS condition.)

### `packages/cli/tsdown.config.ts`
```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  name: '@nukesai-pos/cli',
  entry: {
    main: 'src/main.ts',
  },
  root: 'src',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  dts: { generator: 'oxc', sourcemap: true },
  unbundle: true,
  hash: false,
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
  nodeProtocol: true,
  deps: { neverBundle: true },
  exports: false,
  publint: true,
  attw: { profile: 'esm-only', level: 'error' },
  report: true,
  failOnWarn: 'ci-only',
})
```

### `packages/cli/eslint.config.js`
```js
import { createBaseConfig } from "@nukesai-pos/eslint-config/base";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    name: "cli/terminal-output",
    files: ["src/**/*.ts"],
    rules: {
      // A CLI's job is to print. Structured output goes through @clack/prompts,
      // but plain console is legitimate here.
      "no-console": "off",
    },
  },
];
```

### `packages/cli/tsconfig.json`
```json
{
  "extends": "@nukesai-pos/typescript-config/library.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tsdown.config.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "dist", "templates"]
}
```

### `packages/cli/src/main.ts`
```ts
#!/usr/bin/env node
import { cancel, isCancel, log } from "@clack/prompts";
import { Command } from "commander";

import { runAdd } from "./commands/add.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runUpgrade } from "./commands/upgrade.js";

export interface GlobalOptions {
  readonly cwd: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly silent: boolean;
  readonly force: boolean;
}

function globalOptions(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals<{
    cwd: string;
    yes: boolean;
    dryRun: boolean;
    silent: boolean;
    force: boolean;
  }>();
  return {
    cwd: opts.cwd,
    yes: opts.yes,
    dryRun: opts.dryRun,
    silent: opts.silent,
    force: opts.force,
  };
}

const program = new Command()
  .name("nukes-pos")
  .description("Scaffold Nukes POS into an existing Next.js 16 application.")
  .version("0.0.0", "-v, --version")
  .option("-c, --cwd <path>", "working directory", process.cwd())
  .option("-y, --yes", "accept all defaults, do not prompt", false)
  .option("-d, --dry-run", "print the plan without writing any files", false)
  .option("-s, --silent", "suppress non-error output", false)
  .option("--force", "proceed even if the git worktree is dirty", false);

program
  .command("init")
  .description("Detect the host app, write nukes-pos.json, and scaffold routes and config.")
  .option("--skip-install", "do not install peer packages", false)
  .action(async (_local: { skipInstall: boolean }, command: Command) => {
    await runInit(globalOptions(command));
  });

program
  .command("add")
  .argument("<features...>", "optional surfaces to scaffold, e.g. reports kds")
  .description("Scaffold an additional Nukes POS surface into an initialised app.")
  .action(async (features: readonly string[], _local: unknown, command: Command) => {
    await runAdd(features, globalOptions(command));
  });

program
  .command("doctor")
  .description("Diagnose the installation. Read-only. Exits non-zero on error.")
  .action(async (_local: unknown, command: Command) => {
    const report = await runDoctor(globalOptions(command));
    if (report.errors.length > 0) {
      for (const problem of report.errors) log.error(problem);
      process.exitCode = 1;
      return;
    }
    for (const note of report.warnings) log.warn(note);
    log.success("No problems detected.");
  });

program
  .command("upgrade")
  .description("Regenerate scaffolded files for the installed version, preserving your edits.")
  .action(async (_local: unknown, command: Command) => {
    // Upgrade defaults to dry-run: never rewrite a consumer's repo unprompted.
    await runUpgrade({ ...globalOptions(command), dryRun: true });
  });

try {
  await program.parseAsync(process.argv);
} catch (error: unknown) {
  if (isCancel(error)) {
    cancel("Cancelled.");
    process.exitCode = 130;
  } else {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
```

### `packages/cli/src/utils/detect.ts`
```ts
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseJsonc } from "comment-json";
import { glob } from "tinyglobby";

export interface ProjectInfo {
  /** Absolute path to the app router directory. */
  readonly appDir: string;
  /** True when routes live under src/app rather than app. */
  readonly isSrcDir: boolean;
  readonly isTypeScript: boolean;
  /** Absolute path to next.config.{js,mjs,ts}, or null when absent. */
  readonly nextConfigPath: string | null;
  readonly nextVersion: string | null;
  /** Import alias prefix from tsconfig paths, e.g. "@" for "@/*". */
  readonly aliasPrefix: string | null;
}

const IGNORE = ["**/node_modules/**", "**/.next/**", "**/public/**", "**/dist/**", "**/build/**"];

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const [nextConfig] = await glob(["next.config.*"], { cwd, ignore: IGNORE, deep: 1, absolute: true });
  if (nextConfig === undefined) {
    throw new Error("No next.config.* found. Run this inside a Next.js application.");
  }

  const isSrcDir = existsSync(path.resolve(cwd, "src", "app"));
  const appDir = isSrcDir ? path.resolve(cwd, "src", "app") : path.resolve(cwd, "app");
  if (!existsSync(appDir)) {
    throw new Error("No app/ or src/app/ directory found. Nukes POS requires the App Router.");
  }

  const tsconfigPath = path.resolve(cwd, "tsconfig.json");
  const isTypeScript = existsSync(tsconfigPath);

  let aliasPrefix: string | null = null;
  if (isTypeScript) {
    const raw = await readFile(tsconfigPath, "utf8");
    const tsconfig = parseJsonc(raw) as {
      compilerOptions?: { paths?: Record<string, readonly string[]> };
    };
    const paths = tsconfig.compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries(paths)) {
      const target = targets[0];
      if (target === "./*" || target === "./src/*" || target === "./app/*") {
        aliasPrefix = alias.replace(/\/\*$/, "");
        break;
      }
    }
  }

  const pkgRaw = await readFile(path.resolve(cwd, "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string> };
  const nextVersion = pkg.dependencies?.next ?? null;

  return { appDir, isSrcDir, isTypeScript, nextConfigPath: nextConfig, nextVersion, aliasPrefix };
}
```

### `packages/cli/src/utils/patch.ts`
```ts
import { readFile, writeFile as fsWriteFile } from "node:fs/promises";

import { parse as parseJsonc, stringify as stringifyJsonc } from "comment-json";
import { builders, loadFile, writeFile } from "magicast";

const WRAPPER = "withNukesPos";
const WRAPPER_SOURCE = "@nukesai-pos/backend/next";

/**
 * Wrap the host app's next.config default export in withNukesPos().
 * Idempotent: a second run detects the existing wrapper and no-ops.
 * Returns true when the file was modified. Verified round-trip with magicast:
 * imports, types and formatting preserved.
 */
export async function patchNextConfig(configPath: string, dryRun: boolean): Promise<boolean> {
  const mod = await loadFile(configPath);

  const alreadyImported = mod.imports.$items.some((item) => item.from === WRAPPER_SOURCE);
  const defaultExport = mod.exports.default as { $type?: string; $callee?: string };
  const alreadyWrapped =
    defaultExport.$type === "function-call" && defaultExport.$callee === WRAPPER;

  if (alreadyImported && alreadyWrapped) return false;

  if (!alreadyImported) {
    mod.imports.$add({ from: WRAPPER_SOURCE, imported: WRAPPER });
  }
  if (!alreadyWrapped) {
    mod.exports.default = builders.functionCall(WRAPPER, mod.exports.default);
  }

  if (!dryRun) await writeFile(mod, configPath);
  return true;
}

/**
 * Add the @nukesai-pos/config path alias, preserving comments in tsconfig.json.
 * Returns true when the file was modified.
 */
export async function patchTsconfig(tsconfigPath: string, dryRun: boolean): Promise<boolean> {
  const source = await readFile(tsconfigPath, "utf8");
  const tsconfig = parseJsonc(source) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };

  tsconfig.compilerOptions ??= {};
  tsconfig.compilerOptions.paths ??= {};
  if ("@nukesai-pos/config" in tsconfig.compilerOptions.paths) return false;

  tsconfig.compilerOptions.paths["@nukesai-pos/config"] = ["./nukes-pos.config.ts"];

  if (!dryRun) await fsWriteFile(tsconfigPath, `${stringifyJsonc(tsconfig, null, 2)}\n`);
  return true;
}
```

### `packages/cli/src/utils/stamp.ts`
```ts
import { createHash } from "node:crypto";

const STAMP = /^\/\/ @nukesai-pos\/cli generated — do not edit\. hash: ([a-f0-9]{64})\n/;

/** Hash is computed over the body EXCLUDING the stamp line, LF-normalized. */
export function hashBody(body: string): string {
  return createHash("sha256").update(body.replaceAll("\r\n", "\n")).digest("hex");
}

export function stamp(body: string): string {
  return `// @nukesai-pos/cli generated — do not edit. hash: ${hashBody(body)}\n${body}`;
}

export type StampState =
  | { readonly kind: "absent" }
  | { readonly kind: "pristine" }
  | { readonly kind: "modified"; readonly body: string };

/**
 * Decide whether an existing generated file may be overwritten.
 * - absent   -> not ours, or never generated; ask before touching.
 * - pristine -> body still matches its stamp; safe to overwrite silently.
 * - modified -> the user edited it; never clobber, emit a .new file + diff.
 */
export function inspect(contents: string): StampState {
  const match = STAMP.exec(contents);
  if (match === null) return { kind: "absent" };

  const recorded = match[1];
  const body = contents.slice(match[0].length);
  return hashBody(body) === recorded ? { kind: "pristine" } : { kind: "modified", body };
}
```

### `packages/cli/templates/consumer/.npmrc`
```
# Authentication for @nukesai-pos restricted packages.
# Set NPM_TOKEN in your shell / CI secrets to a granular access token with
# READ-ONLY access to the @nukesai-pos scope. The literal ${NPM_TOKEN} below is
# expanded by npm/pnpm at read time and must NOT be replaced with the token.
@nukesai-pos:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

---

### `apps/example/package.json`
```json
{
  "name": "@nukesai-pos/example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "next build",
    "check-types": "next typegen && tsc --noEmit",
    "dev": "next dev",
    "lint": "eslint .",
    "start": "next start"
  },
  "dependencies": {
    "@nukesai-pos/backend": "workspace:^",
    "@nukesai-pos/common": "workspace:^",
    "@nukesai-pos/frontend": "workspace:^",
    "next": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@nukesai-pos/eslint-config": "workspace:*",
    "@nukesai-pos/typescript-config": "workspace:*",
    "@types/node": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:"
  }
}
```
(`start` reads PORT from the environment — playwright.config.ts sets PORT=3100. `next typegen && tsc` is the documented Next 16 pattern: typegen exits non-zero so `tsc` halts instead of running on stale types.)

### `apps/example/next.config.ts`
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required once a real DB/ORM driver is dropped into the adapter port —
  // Next bundles Server Component imports by default and native drivers break.
  serverExternalPackages: ['@nukesai-pos/backend'],

  experimental: {
    // Still flagged experimental in 16.3.1. Belt-and-braces on top of the
    // multi-subpath + leaf-directive + sideEffects design, which was verified
    // to tree-shake correctly WITHOUT this flag.
    optimizePackageImports: ['@nukesai-pos/frontend', '@nukesai-pos/common'],
  },
}

export default nextConfig
```

### `apps/example/tsconfig.json`
```json
{
  "extends": "@nukesai-pos/typescript-config/nextjs.json"
}
```

### `apps/example/eslint.config.js`
```js
import { createReactConfig } from "@nukesai-pos/eslint-config/react";

export default [...createReactConfig({ tsconfigRootDir: import.meta.dirname })];
```

---

### `docs/architecture/isolation.md`
```md
# Server/Client Isolation Contract

> Normative. Every rule here is enforced by a machine. If a rule is not
> enforced, it is not a rule.

## 1. Mechanisms and what each actually guarantees

| Mechanism | Layer | Guarantee | Failure mode if used alone |
| --- | --- | --- | --- |
| `"use client"` directive | Bundler | Marks the **entry to a client subtree**. Every module it imports joins the client graph. | Says what *may* ship to the browser. Never prevents anything. |
| `"use server"` directive | Bundler + React | Marks Server Functions; they cross the boundary as a *reference*, not as code. | Not an access-control mechanism. |
| `react-server` export condition | Resolver | Lets one specifier resolve to **different files** in the RSC graph vs the client graph. | Silently no-ops if the bundler does not set the condition. |
| `browser` export condition → throwing guard | Resolver | Turbopack resolves it in the app-client layer; the build **fails** there and the real module never enters `.next/static`. Verified. | Error message is cryptic (see §2). |
| `server-only` / `client-only` | Resolver + module eval | The **poison pill**. Build-time error on wrong-graph import. | Only fires if the import survives tree-shaking. |
| Runtime guard (`assertServerRuntime`) | Runtime | Last-resort throw if a module is *evaluated* in the wrong runtime. | Runs too late to protect a build; catches misconfiguration, not mistakes. |

### How the poison pill works

`server-only` ships exactly two files and this `exports` map:

```json
{ "exports": { ".": { "react-server": "./empty.js", "default": "./index.js" } } }
```

`index.js` is a bare top-level `throw`; `empty.js` is empty. In the RSC graph
(where the `react-server` condition is set) the import vanishes; in the client
graph it throws. Next.js 16 additionally intercepts both specifiers internally
for a better message. We install them as **real dependencies** anyway: (a) our
packages must behave under non-Next RSC bundlers, and (b) the dist boundary
tests grep for the import.

**Custom export conditions are forbidden.** Turbopack does not support
user-defined conditions — they silently fall through to `default`, which is
exactly how server code would leak into a browser bundle.

## 2. Package contracts

### `@nukesai-pos/backend` — server-only, no exceptions

Two independent locks, because one is not enough:

1. **Poison pill.** Every public entry file (except the type-only `./ports`)
   begins with `import "server-only";`.
2. **`browser` condition → throwing guard.** The `.` and `./adapters/demo`
   subpaths resolve to `dist/_browser_guard.js` in any browser graph. Verified
   on Next 16.3.1/Turbopack: the client build fails and the real module is
   absent from `.next/static`. The guard's error is cryptic
   (`Export X doesn't exist in target module …_browser_guard.js [app-client]`),
   which is why `server-only` — whose Next-intercepted message is clear — fires
   first in practice.

The `default` condition points at the **real** module (NOT a poison file), so
plain-Node consumers — vitest, scripts — work without configuring resolver
conditions. Backend never contains `"use client"`, never imports react or
`@nukesai-pos/frontend` (lint- and peer-enforced), and exposes persistence
strictly through **ports** so a driver can be dropped in later without touching
the public API. Every port method takes `locationId` first — flat database,
branch isolation, not multi-tenant.

### `@nukesai-pos/frontend` — mixed, boundary as deep as possible

- **No root export.** Only `./server` and `./client` (+`./styles.css`). There is
  no import specifier that yields both halves.
- `"use client"` goes on the **leaf** that needs state, never on a barrel. A
  directive-carrying barrel becomes one client boundary and leaks every unused
  export into the consumer's client bundle — verified, and lint-forbidden.
- **`unbundle: true` is mandatory.** tsdown's default bundled mode silently
  drops `"use client"`; only unbundle mode preserves it per-file. There is no
  `preserveDirectives` option. The dist test is the backstop.
- `src/server/index.ts` starts with `import "server-only"` — the RSC surface is
  poisoned against client import just like backend.
- Server-fetched data reaches client leaves as **serializable props** or a
  pending promise read with `use()` — never by a client component importing a
  data function.
- Lazy loading: `next/dynamic` calls live **inside `"use client"` modules**
  (`ssr: false` is a hard error in RSC; RSC→client dynamic import does not
  code-split). `next/dynamic` is never re-exported from the public surface.

### `@nukesai-pos/common` — isomorphic, and provably so

Banned outright: Node builtins (bare and `node:`-prefixed), `process` /
`process.env`, DOM globals, `server-only`, `client-only`, and any dependency on
the other two packages. Config is **injected as a parameter**, never read from
the ambient environment. The single sanctioned environment sniff is
`src/runtime/guard.ts` (typeof-guarded, with a justified lint disable).

Note: tsdown `platform: "neutral"` only *warns* on a Node-builtin import and
still exits 0 — it is a signal, not a gate. The gates are the lint zones and
the dist tests.

## 3. Directory convention

**Directories, not filename suffixes.**

```
src/server/   # RSC/Node only.  Poisoned with server-only.
src/client/   # Browser.        "use client" on leaves, never on index.ts.
```

Shared code does not get a `shared/` dir — it lives in `@nukesai-pos/common`.
Directories were chosen because `import-x/no-restricted-paths` zones and
flat-config `files` globs key off directory prefixes; a suffix convention
cannot be expressed as a zone. Directories also map 1:1 onto export subpaths
and onto unbundle output, so the boundary is visible in the published tarball.

## 4. Lint enforcement

Two plugins — `eslint-plugin-import-x` (the only import plugin declaring
ESLint 10 support) and `eslint-import-resolver-typescript`. Everything else is
ESLint core. Two layers, both kept (neither is a superset):

- **`no-restricted-imports`** matches the *specifier string* — catches
  `@nukesai-pos/backend`, `server-only`, `node:fs` outright.
- **`import-x/no-restricted-paths`** matches the *resolved file path* — catches
  aliased and `.js`-suffixed TS imports that string matching misses. **The TS
  resolver is required**: with the default node resolver the zone rule silently
  passes (verified false-negative).

The rules ship as a factory (`boundaries({ packageDir, zone })`) because
`basePath` must be each package's own absolute dir — a shared static config
silently matches nothing. Zones: backend=`server`, frontend=`mixed`,
common=`isomorphic`, cli=none.

`@next/eslint-plugin-next` ships **no** server/client boundary rule — which is
why this config exists. React Compiler rules come bundled with
`eslint-plugin-react-hooks@7` (`configs.flat.recommended`); no separate
compiler plugin.

## 5. Testing the boundary

Lint checks source; the dist tests check **what we publish**. They walk each
package's `dist/` (root `pnpm test` builds first) and assert the contract
survived the build:

- every non-barrel `client/**` chunk keeps `"use client"`; barrels never carry it;
- no client chunk imports `server-only` or a node builtin;
- no server chunk is `"use client"`; guarded entries keep `import "server-only"`;
- `_browser_guard.js` exists and throws;
- every glob asserts a non-empty match set (no vacuous passes).

A dropped directive or a tree-shaken poison pill is a silent,
ships-to-production class of bug that only these tests catch — both failure
modes were reproduced during research.
```

---

*End of decision record. Implementation order is in the summary returned alongside this file.*
