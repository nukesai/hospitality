# CLAUDE.md

**Read [AGENTS.md](./AGENTS.md) first — it is the canonical rulebook for this
repo.** Everything there (layering, SSR/CSR isolation, coverage, packaging,
commit rules) is binding. This file adds only Claude-specific workflow notes.

## Quick orientation

Package factory: `@nukesai-pos/{common,backend,frontend,cli}` published as
restricted npm packages, scaffolded into consumer Next.js 16 apps by the CLI.
Flat DB, per-location isolation, NOT multi-tenant. `apps/example` = E2E target.
Data layer deferred behind ports (`packages/backend/src/ports/`).

## Commands

```bash
pnpm build | check-types | lint | test | e2e | size | knip | coverage:canary
pnpm format          # prettier writes; format:check in CI
pnpm changeset       # one per user-visible package change (fixed versioning)
```

`pnpm test` builds first (dist boundary tests need dist/). Run a single
package's tests: `pnpm exec vitest run --project backend`.

## Delivery workflow (gstack)

Use the gstack skills for feature delivery — do not hand-roll the process:

1. `/spec` — turn intent into a precise ticket before non-trivial work
2. implement on a branch, committing per logical change (scoped conventional
   commits; scopes listed in AGENTS.md §5)
3. `/review` — pre-landing review of the diff
4. `/ship` — tests, changelog, PR creation
5. `/land-and-deploy` — merge + verify

## Claude-specific cautions

- Do not "fix" the TS6 alias in `packages/eslint-config` to match the root
  TS7 — it is deliberate (typescript-eslint cannot run on TS7).
- Do not add `coverage` to a package-level vitest config (silently ignored) or
  weaken the root thresholds — fix the missing test instead.
- Do not put `"use client"` on any index/barrel file; put it on the leaf.
- Do not switch tsdown to bundled mode; `unbundle: true` preserves directives.
- Do not add dependencies outside the pnpm catalog; syncpack gates CI.
- When adding a public export: subpath in the hand-written exports map +
  size-limit entry + tests to keep coverage at 100%.
- The 100% gate is honest by design — `coverage.include` is explicit and the
  canary proves failure works. Never game it with excludes.
