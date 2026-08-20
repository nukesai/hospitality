# @nukesai-pos/frontend

Admin panel UI for the Nukes POS platform — React Server Components plus
interactive client leaves. Proprietary — © Nukes AI & Software Solution.

**No root export.** The SSR/CSR boundary is un-violatable by construction —
there is no import specifier that yields both halves:

```ts
import { OrderSummary } from "@nukesai-pos/frontend/server"; // RSC, server-only poisoned
import { OrderTicket } from "@nukesai-pos/frontend/client"; // "use client" leaves
```

- `"use client"` lives on **leaf components only**, never on barrels — unused
  components tree-shake out of the consumer's client bundle (enforced by lint
  and by dist boundary tests; per-export size budgets gate CI).
- Server data reaches client leaves as **serializable props** — client code
  never imports data functions.
- Tailwind v4 consumers: `@import "@nukesai-pos/frontend/styles.css";` registers
  the package's dist as a scan source.
