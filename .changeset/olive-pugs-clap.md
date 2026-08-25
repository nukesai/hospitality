---
"@nukesai-pos/common": minor
"@nukesai-pos/backend": minor
"@nukesai-pos/frontend": minor
"@nukesai-pos/cli": minor
---

Restore and machine-enforce the two-lock server/client isolation contract.

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
