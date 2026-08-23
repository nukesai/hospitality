---
"@nukesai-pos/backend": patch
---

Restore and machine-enforce the two-lock server/client isolation contract.

Six published backend entries were missing a lock. `./adapters/cache-redis` and
`./adapters/cache-upstash` had neither, while shipping `ioredis` and
`@upstash/redis`; `./auth`, `./adapters/logging` and `./adapters/cache-memory`
were missing the `server-only` pill; `./bootstrap` carried it only transitively.
All six are fixed, and the two driver-bearing adapters now resolve to the
throwing browser guard.

**Potentially breaking for one case, by design.** If you were importing a
backend cache adapter, `@nukesai-pos/backend/auth`, or
`@nukesai-pos/backend/adapters/logging` from a client component, that build now
fails instead of silently pulling a database driver into your browser bundle.
That import was never supported — the backend package is server-only — but it
used to fail quietly or not at all. Move the import into a server component,
route handler, or server action.

The dist boundary test now derives its entry list from the package's own
`exports` map instead of a hard-coded pair, so every future subpath is covered
the day it is published.

Branch isolation is also a real rule now: an ESLint ban blocks raw
`db.transaction` and `set_config` outside the sanctioned `withBranchContext()`,
closing a path where a transaction could run with the RLS GUCs unset.
