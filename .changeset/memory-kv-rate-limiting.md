---
"@nukesai-pos/common": minor
"@nukesai-pos/backend": minor
"@nukesai-pos/frontend": minor
"@nukesai-pos/cli": minor
---

API rate limiting now works without Redis.

Redis stays an optional peer dependency — nothing about that changes — but it is
no longer the thing that decides whether your API has a rate limit at all.

Previously `CACHE_DRIVER=memory` (the default) produced no KV, and
`checkRateLimit` returned early whenever the KV was absent. Every tRPC route was
unlimited, on every deployment that had not provisioned Redis, silently. An
infrastructure choice was quietly setting a security posture.

`createMemoryKv()` is a new in-process `KvPort`, exported from
`@nukesai-pos/backend/adapters/cache-memory`, and the memory driver now returns
it. Rate limits are enforced everywhere. Redis upgrades them from per-process to
shared, rather than from off to on.

**The caveat, stated plainly:** without Redis the window is per-process, so N
instances allow roughly N times the configured limit. That is bounded and
documented, unlike no limit at all, which is unbounded.

Two related changes:

- `createCacheFromEnv` now returns `sharedKv` alongside `kv`. Only `sharedKv`
  backs better-auth's `SecondaryStorage`, and it is non-null only for Redis.
  Without Redis better-auth keeps falling back to Postgres, which is *shared*
  across instances — handing it a per-process store would have made sessions and
  better-auth's own limiter less correct, not more.
- The memory-driver warning now fires in **every** environment, not just
  production. A public staging box on the default driver has per-process
  invalidation and per-process limits, and previously said nothing about either.

`PosTrpcDeps.kv` is now `KvPort` rather than `KvPort | null`. Consumers
constructing tRPC deps by hand must supply one; `createNukesPos` always does.
