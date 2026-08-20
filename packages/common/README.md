# @nukesai-pos/common

Isomorphic leaf package of the Nukes POS platform: i18n (per-locale entry
points), shared types, schema validators, constants and runtime guards.
Proprietary — © Nukes AI & Software Solution.

**Guarantees**

- Safe in _both_ the server and client graph: no Node builtins, no DOM globals,
  no `process.env` — configuration is always injected as parameters.
- Fully tree-shakable: `sideEffects: false`, per-module dist output, subpath
  exports (`/types`, `/constants`, `/schemas`, `/i18n`, `/i18n/locales/*`,
  `/runtime`). Importing the `ne` locale never pays for `en`.

```ts
import { formatMoney, createTranslator, toLocationId } from "@nukesai-pos/common";
import { en } from "@nukesai-pos/common/i18n/locales/en";
import type { Order, LocationId } from "@nukesai-pos/common/types";
```

Every port/API in the platform takes a `LocationId` first — flat database,
strict per-location (branch) isolation, not multi-tenant.
