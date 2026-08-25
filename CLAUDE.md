# CLAUDE.md

Two files come first, in this order:

1. **[AGENTS.md](./AGENTS.md)** — the canonical rulebook. Layering, SSR/CSR
   isolation, coverage, packaging, commit rules. Binding.
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the map. What each package owns,
   the directory layout and what each directory means, the request lifecycle,
   and the extension recipe for the change you are about to make.

This file adds only Claude-specific workflow notes.

## Quick orientation

Package factory: `@nukesai-pos/{common,backend,frontend,cli}` published as
public npm packages, scaffolded into consumer Next.js 16 apps by the CLI.
Flat DB, per-location isolation, NOT multi-tenant. `apps/example` is the CLI's
output — a real consumer app, built and E2E-tested on every commit, and the
byte-source of the scaffold templates.

The organising principle: **the packages own the integration, the consumer app
owns almost nothing.** If a change would make consumers edit files they did not
write, it belongs in a package instead.

## Commands

```bash
pnpm build | check-types | lint | test | e2e | size | knip
pnpm lint:bans       # proves the boundary bans survive into the effective config
pnpm coverage:canary # proves the coverage gate can fail
pnpm format          # prettier writes; format:check in CI
pnpm changeset       # one per user-visible package change (fixed versioning)
```

`pnpm test` builds first (the dist boundary tests and the CLI template-sync
test read `dist/` and `apps/example`). Single package:
`pnpm exec vitest run --project backend`. Live stack: `pnpm stack:up`, then
`E2E_STACK=1 pnpm e2e` for the full suite.

## Branches and channels (read this before creating any branch)

Three long-lived branches. **The branch that receives a merge is the only thing
that selects an npm channel** — there is no flag, no pre mode, no env var.

| Branch        | Merging into it publishes           | Version                          | dist-tag | Commits versions    |
| ------------- | ----------------------------------- | -------------------------------- | -------- | ------------------- |
| `development` | a canary, every push                | `0.0.0-canary-<utc14>-<sha7>`    | `canary` | no                  |
| `staging`     | a beta, when the queue is non-empty | `<next>-beta.<utc14>.sha-<sha7>` | `beta`   | no                  |
| `main`        | a GA                                | `<next>`                         | `latest` | **yes — only here** |

```
feat/*  ──PR──▶  development  ──promotion PR──▶  staging  ──promotion PR──▶  main
                   @canary                       @beta                     @latest
```

**Branch feature work from `development`, and open the PR into `development`.**
Not `main`. `main` is the base only for `hotfix/*`, which is the one branch
allowed to cut from it.

Promotion PRs are opened and refreshed automatically by `promote.yml`; merging
one is the decision, and merging `staging → main` **is** the release decision.
Only `main` commits version bumps — that is what keeps promotion merges
conflict-free, so never move version bumping onto another branch.

`RELEASING.md` is the runbook: normal flow, hotfix lane, and the three-tier
rollback. Read it before any release, rollback, or branch surgery.

## Delivery workflow (gstack)

Use the gstack skills — do not hand-roll the process:

1. `/spec` — turn intent into a precise ticket before non-trivial work
2. branch **from `development`**, committing per logical change (scoped
   conventional commits; scopes listed in AGENTS.md §5)
3. `pnpm changeset` — bump level plus a prose note, naming **all four**
   published packages
4. `/review` — pre-landing review of the diff
5. `/ship` — tests, changeset, PR creation (base: `development`)
6. `/land-and-deploy` — merge + verify

Never push to `main`, `staging`, or `development` directly, and never open a PR
by hand.

## Traps that have actually bitten this repo

Each of these compiled, passed tests, and was still wrong. Verify, do not assume.

- **Branch from `development`, and create long-lived branches only from a
  FRESHLY FETCHED base.** `staging` and `development` were once cut from a local
  `main` that had not been pulled, so both landed 9 commits behind and carried
  none of the release workflows — pushes to them published nothing, silently.
  `git fetch` first, and check `git rev-list --count origin/<b>..origin/main`.
- **npm takes ~63s to publish `@nukesai-pos/cli` after the first package** in
  the same `pnpm publish -r` (measured from npm's own `time` records, twice). A
  release verifier that waits less reddens correct releases. Never shorten
  `scripts/verify-published.mjs`'s retry budget to "speed up" a release.
- **ESLint flat config replaces rule options wholesale.** Adding a second block
  for `no-restricted-imports` silently deleted an earlier ban — and a deleted
  ban simply never fires, so nothing went red. Merge; then `pnpm lint:bans`.
- **`z.ZodType<T>` leaves `Input` as `unknown`** and silently widens every tRPC
  client input. Always both parameters: `z.ZodType<Output, Input>`.
- **A widened `PosErrorShape["code"]`** makes initTRPC fall back to the default
  error shape, so clients lose the typed `error.data` — with no error anywhere.
- **A next-intl `onError` that throws** turns a graceful fallback into a 500,
  because use-intl calls it from inside its own catch block.
- **Reading a request header in the locale cascade** opts every page out of
  static rendering. Check the build output (`● /en`, not `f /[locale]`).
- **`in` walks the prototype chain** — `add constructor` corrupted a customer's
  router file. Use `Object.hasOwn` for registry lookups.
- **`getPos()` retries a failed boot**, so a boot that dies half-built must tear
  down what it created or every retry strands another `pg.Pool`.
- **Do not "fix" the TS6 alias** in `packages/eslint-config` to match the root
  TS7 — it is deliberate (typescript-eslint cannot run on TS7).
- **Do not add `coverage` to a package-level vitest config** (silently ignored)
  or weaken the root thresholds — write the missing test.
- **Do not put `"use client"` on an index/barrel** — put it on the leaf.
- **Do not switch tsdown to bundled mode**; `unbundle: true` is what preserves
  the directives.
- **Do not add dependencies outside the pnpm catalog**; syncpack gates CI.
- **When adding a public export**: subpath in the hand-written exports map +
  size-limit entry + tests to keep coverage at 100%.
- **The 100% gate is honest by design** — `coverage.include` is explicit and the
  canary proves failure works. Never game it with excludes.
- **The CLI writes into customer repositories.** It fails loudly or not at all:
  validate before writing, never clobber a hand-edited file, never drop a
  ledger entry.

## graphify

Optional local tooling, not a repo dependency: `graphify` is a personal install,
absent on most machines and invisible to the pnpm catalog and syncpack. When
`graphify-out/graph.json` is missing, skip this section and use grep. Its output
is generated and reviewed by nobody, so it outranks nothing here: AGENTS.md is
binding, `docs/architecture/isolation.md` is normative for the SSR/CSR boundary,
`.nukes/RESEARCH-BACKEND.md` R1–R16 are binding for the backend, and
ARCHITECTURE.md is the map. Where the graph disagrees with any of them, the
graph is the bug.

When it is present:

- Prefer `graphify query "<question>"` to a raw grep sweep for codebase
  questions, `graphify path "<A>" "<B>"` for relationships, and
  `graphify explain "<concept>"` for one concept. Each returns a scoped
  subgraph, usually far smaller than GRAPH_REPORT.md or a grep dump.
- `graphify-out/wiki/index.md` is the cheapest way to navigate broadly.
- Read `graphify-out/GRAPH_REPORT.md` only when query/path/explain do not
  surface enough context.
- Run `graphify update .` after modifying code (AST-only, no API cost). Nothing
  refreshes the graph on pull, checkout, rebase, or merge, so treat it as stale
  after any of those and confirm against source before trusting it.
