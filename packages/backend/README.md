# @nukesai-pos/backend

Server-side business logic and data-access **ports** for the Nukes POS
platform — everything that backs `/api/**` in a consumer Next.js app.
Proprietary — © Nukes AI & Software Solution.

**SERVER ONLY.** Triple-locked:

1. `import "server-only"` on every guarded entry (build-time poison pill),
2. the `browser` export condition resolves to a throwing guard — a client
   component importing this package **fails the consumer's `next build`**,
3. no `react`/`react-dom` peer — UI imports fail by construction.

**Ports & adapters.** The data layer is deliberately deferred: business logic
depends only on interfaces in `@nukesai-pos/backend/ports`. The foundation
ships an in-memory reference adapter:

```ts
import { createDemoOrderRepository } from "@nukesai-pos/backend/adapters/demo";
import { DEMO_LOCATION_ID } from "@nukesai-pos/common";

const repo = createDemoOrderRepository();
await repo.listByStatus(DEMO_LOCATION_ID, "pending");
```

A real driver (SQL/ORM) lands later as `@nukesai-pos/backend/adapters/<driver>`
— a new subpath, zero public-API change. Every port method takes `locationId`
first (flat DB, branch isolation).

Consumers should add `serverExternalPackages: ["@nukesai-pos/backend"]` to
`next.config.ts` once a native driver is configured.
