# AGENTS.md — Rules of this repository

Canonical guide for every agent (and human) working in this repo. `CLAUDE.md`
points here. If a rule below conflicts with your instincts, the rule wins; if a
rule is not enforced by a machine yet, propose the enforcement in the same PR.

## 1. What this repo is

A **package factory** (pnpm + turborepo). It publishes proprietary, restricted
npm packages under `@nukesai-pos/*` that add a POS backend (API) and admin
panel to any existing Next.js 16 app via `npx @nukesai-pos/cli init`.
It is NOT an application; `apps/example` exists only as the E2E target and
consumer fixture.

Product scope: restaurant/bar/hotel POS. **Flat database, per-location
(branch) isolation — every port method takes `locationId` first. NOT
multi-tenant SaaS.** Feature inspiration: PRODUCT.md.

## 2. Architecture — the non-negotiables

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
  `publishConfig.access: "restricted"`, `provenance: false`,
  `license: "UNLICENSED"`, author Nukes AI & Software Solution.
- Barrels (`index.ts`) contain re-exports ONLY — logic in an index file breaks
  the coverage exclusion contract.
- No TypeScript enums (erasableSyntaxOnly); const object + union type.
- New public surface ⇒ new subpath export + size-limit budget entry.
- Versions live in the pnpm catalog (`pnpm-workspace.yaml`). Never write a bare
  semver in a package.json — syncpack's catalog policy gates CI. The single
  exception: the TS6 alias in `packages/eslint-config` (typescript-eslint
  cannot run on TS7 yet).

## 4. Quality gates (all blocking, all in CI)

| Gate      | Command                | Contract                                                                                              |
| --------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Types     | `pnpm check-types`     | TS 7 `tsc --noEmit` is the authority                                                                  |
| Lint      | `pnpm lint`            | typed rules + boundary zones; zero warnings tolerated                                                 |
| Unit      | `pnpm test`            | 100% statements/branches/functions/lines, perFile, root-only coverage                                 |
| Canary    | `pnpm coverage:canary` | proves the gate can fail                                                                              |
| E2E       | `pnpm e2e`             | production `next start` of apps/example on :3100                                                      |
| Size      | `pnpm size`            | per-export gzip budgets = the Lighthouse guard; raising a budget requires a dedicated reviewed commit |
| Dead code | `pnpm knip`            | no unused files/deps/exports                                                                          |
| Format    | `pnpm format:check`    | prettier owns ALL formatting                                                                          |

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

## 7. Where to look

| Question                        | Answer                                                    |
| ------------------------------- | --------------------------------------------------------- |
| Why is the toolchain like this? | `.nukes/RESEARCH.md` (verified decision record)           |
| What may import what?           | §2 above + `packages/eslint-config/boundaries.js`         |
| SSR/CSR mechanics               | `docs/architecture/isolation.md`                          |
| Product feature scope           | `PRODUCT.md`                                              |
| Release mechanics               | `.changeset/config.json`, `.github/workflows/release.yml` |
