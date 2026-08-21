# Nukes POS

Package-based point-of-sale platform for restaurants, bars and hotels — built by
**Nukes AI & Software Solution** (<info@nukesai.com>). Proprietary; see [LICENSE](./LICENSE).

This repository is a **package factory**, not an app. It publishes private,
restricted npm packages under the `@nukesai-pos` scope that drop a full POS
backend (API) and admin panel into **any existing Next.js 16 application**:

| Package                                        | Runtime         | What it is                                           |
| ---------------------------------------------- | --------------- | ---------------------------------------------------- |
| [`@nukesai-pos/common`](./packages/common)     | isomorphic      | i18n, types, schemas, constants, runtime guards      |
| [`@nukesai-pos/backend`](./packages/backend)   | **server-only** | business logic + data-access ports (`/api/**`)       |
| [`@nukesai-pos/frontend`](./packages/frontend) | RSC + client    | admin panel UI                                       |
| [`@nukesai-pos/cli`](./packages/cli)           | Node CLI        | `npx @nukesai-pos/cli init` scaffolds a consumer app |

Data model: **flat database with per-location (branch) isolation** — every port
method takes a `LocationId` first. Explicitly _not_ multi-tenant SaaS.

## Consumer quick start

```bash
cd your-nextjs-app
npx @nukesai-pos/cli init     # scaffolds EVERYTHING: api catch-all, admin route,
                              # i18n request config, routers, deps, env template,
                              # and wraps next.config in withNukesPos()
npx @nukesai-pos/cli add          # create the app-local router composition
                                  # (server/routers/_app.ts) and wire features in
npx @nukesai-pos/cli doctor       # stamps, env, markers, version drift
npx @nukesai-pos/cli upgrade      # regenerate pristine files after a bump
```

What a consumer app owns after `init` — everything else lives in the packages:

```
app/api/pos/[[...pos]]/route.ts   -> createPosApi(pos, posCoreRouter)  (auth/trpc/rest/openapi/docs;
                                     new feature routers arrive with the package version — zero edits)
app/(nukes-pos)/admin/[[...admin]]/page.tsx -> PosAdminShell            (sections routed package-side)
i18n/request.ts                   -> createPosRequestConfig()           (one line)
proxy.ts + app/[locale]/*         -> only with --i18n-routing (locale-prefixed URLs)
server/routers/_app.ts            -> OPTIONAL, created by `nukes-pos add`
                                     only when you add app-local procedures
                                     (then point route.ts at its appRouter)
```

## Development

Requires Node ≥ 24.18 and pnpm 11.10 (`corepack enable`).

```bash
pnpm install
pnpm build          # tsdown package builds + example next build (publint/attw inside)
pnpm check-types    # TypeScript 7 (Go-native tsc)
pnpm lint           # ESLint 10 flat config, type-aware, boundary zones
pnpm test           # vitest — 100% coverage gate, root-only
pnpm coverage:canary # proves the coverage gate can fail
pnpm e2e            # playwright against the production example app (:3100)
pnpm size           # per-export gzip budgets (tree-shaking gate)
pnpm knip           # dead files/deps/exports
```

## Architecture

Read these before touching code:

- [AGENTS.md](./AGENTS.md) — the rules of this repo (humans and AI agents)
- [docs/architecture/isolation.md](./docs/architecture/isolation.md) — the SSR/CSR isolation contract
- [.nukes/RESEARCH.md](./.nukes/RESEARCH.md) — the verified decision record behind every toolchain choice

### The layering rule

```
common  ←  backend      (backend may import common)
common  ←  frontend     (frontend may import common)
NOTHING ELSE.
```

`frontend` never imports `backend` (data crosses only as serializable props /
route handlers in the consumer app). `common` is a leaf. `cli` imports no
workspace package at runtime.

## Releases

Changesets with a **fixed version group** — all four published packages always
share one version. `pnpm changeset` per user-visible change; the release
workflow versions and publishes (`restricted` access) from `main`.
