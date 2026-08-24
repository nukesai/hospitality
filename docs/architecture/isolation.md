# Server/Client Isolation Contract

> Normative. Every rule here is enforced by a machine. If a rule is not
> enforced, it is not a rule.

## 1. Mechanisms and what each actually guarantees

| Mechanism                                   | Layer                  | Guarantee                                                                                                                           | Failure mode if used alone                                                |
| ------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `"use client"` directive                    | Bundler                | Marks the **entry to a client subtree**. Every module it imports joins the client graph.                                            | Says what _may_ ship to the browser. Never prevents anything.             |
| `"use server"` directive                    | Bundler + React        | Marks Server Functions; they cross the boundary as a _reference_, not as code.                                                      | Not an access-control mechanism.                                          |
| `react-server` export condition             | Resolver               | Lets one specifier resolve to **different files** in the RSC graph vs the client graph.                                             | Silently no-ops if the bundler does not set the condition.                |
| `browser` export condition → throwing guard | Resolver               | Turbopack resolves it in the app-client layer; the build **fails** there and the real module never enters `.next/static`. Verified. | Error message is cryptic (see §2).                                        |
| `server-only` / `client-only`               | Resolver + module eval | The **poison pill**. Build-time error on wrong-graph import.                                                                        | Only fires if the import survives tree-shaking.                           |
| Runtime guard (`assertServerRuntime`)       | Runtime                | Last-resort throw if a module is _evaluated_ in the wrong runtime.                                                                  | Runs too late to protect a build; catches misconfiguration, not mistakes. |

### How the poison pill works

`server-only` ships exactly two files and this `exports` map:

```json
{ "exports": { ".": { "react-server": "./empty.js", "default": "./index.js" } } }
```

`index.js` is a bare top-level `throw`; `empty.js` is empty. In the RSC graph
(where the `react-server` condition is set) the import vanishes; in the client
graph it throws. Next.js 16 additionally intercepts both specifiers internally
for a better message. We install them as **real dependencies** anyway: (a) our
packages must behave under non-Next RSC bundlers, and (b) the dist boundary
tests grep for the import.

**Custom export conditions are forbidden.** Turbopack does not support
user-defined conditions — they silently fall through to `default`, which is
exactly how server code would leak into a browser bundle.

## 2. Package contracts

### `@nukesai-pos/backend` — server-only, no exceptions

Two independent locks, because one is not enough:

1. **Poison pill.** Every public entry file begins with `import "server-only";`,
   except the type-only `./ports` and `./env` (scripts import it — see
   `.nukes/RESEARCH-BACKEND.md` §2). This includes `./adapters/cache-memory`:
   being isomorphic-safe excuses it from lock 2 only, never from the pill,
   because the package is server-only with no exceptions.
2. **`browser` condition → throwing guard.** Every subpath except `./ports`,
   `./env`, and the isomorphic-safe `./adapters/cache-memory` resolves to
   `dist/internal/browser-guard.js` in any browser graph. Verified
   on Next 16.3.1/Turbopack: the client build fails and the real module is
   absent from `.next/static`. The guard's error is cryptic
   (`Export X doesn't exist in target module …browser-guard.js [app-client]`),
   which is why `server-only` — whose Next-intercepted message is clear — fires
   first in practice.

Neither list is maintained by hand. `packages/backend/test/boundary.dist.test.ts`
derives the entry set from the package's own `exports` map and asserts both locks
on every entry, so a new subpath is covered the day it is published and an
exemption that stops matching a real subpath fails the suite.

The `default` condition points at the **real** module (NOT a poison file), so a
plain-Node resolver still finds real code rather than a stub.

That is a statement about **resolution, not execution.** `server-only` itself
ships `{ "react-server": "./empty.js", "default": "./index.js" }`, and its
`default` is a bare `throw`. So any pill-bearing entry loads cleanly in the
react-server graph (Next server components, route handlers, server actions) and
throws under plain Node. This has always been true of the pilled entries — the
repo's own suite only works because `packages/backend/vitest.config.ts` aliases
`server-only` to `test/server-only-stub.ts`. A consumer running backend code
under plain-Node vitest needs the same alias; scripts should import `./env`,
which is pill-exempt for exactly this reason.

Backend never contains `"use client"`, never imports react or
`@nukesai-pos/frontend` (lint- and peer-enforced), and exposes persistence
strictly through **ports** so a driver can be dropped in later without touching
the public API. Every port method takes `locationId` first — flat database,
branch isolation, not multi-tenant.

### `@nukesai-pos/frontend` — mixed, boundary as deep as possible

- **No root export.** Only `./server` and `./client` (+`./styles.css`). There is
  no import specifier that yields both halves.
- `"use client"` goes on the **leaf** that needs state, never on a barrel. A
  directive-carrying barrel becomes one client boundary and leaks every unused
  export into the consumer's client bundle — verified, and lint-forbidden.
- **`unbundle: true` is mandatory.** tsdown's default bundled mode silently
  drops `"use client"`; only unbundle mode preserves it per-file. There is no
  `preserveDirectives` option. The dist test is the backstop.
- `src/server/index.ts` starts with `import "server-only"` — the RSC surface is
  poisoned against client import just like backend.
- Server-fetched data reaches client leaves as **serializable props** or a
  pending promise read with `use()` — never by a client component importing a
  data function.
- Lazy loading: `next/dynamic` calls live **inside `"use client"` modules**
  (`ssr: false` is a hard error in RSC; RSC→client dynamic import does not
  code-split). `next/dynamic` is never re-exported from the public surface.

### `@nukesai-pos/common` — isomorphic, and provably so

Banned outright: Node builtins (bare and `node:`-prefixed), `process` /
`process.env`, DOM globals, `server-only`, `client-only`, and any dependency on
the other two packages. Config is **injected as a parameter**, never read from
the ambient environment. The single sanctioned environment sniff is
`src/runtime/guard.ts` (typeof-guarded, with a justified lint disable).

Note: tsdown `platform: "neutral"` only _warns_ on a Node-builtin import and
still exits 0 — it is a signal, not a gate. The gates are the lint zones and
the dist tests.

## 3. Directory convention

**Directories, not filename suffixes.**

```
src/server/   # RSC/Node only.  Poisoned with server-only.
src/client/   # Browser.        "use client" on leaves, never on index.ts.
```

Shared code does not get a `shared/` dir — it lives in `@nukesai-pos/common`.
Directories were chosen because `import-x/no-restricted-paths` zones and
flat-config `files` globs key off directory prefixes; a suffix convention
cannot be expressed as a zone. Directories also map 1:1 onto export subpaths
and onto unbundle output, so the boundary is visible in the published tarball.

## 4. Lint enforcement

Two plugins — `eslint-plugin-import-x` (the only import plugin declaring
ESLint 10 support) and `eslint-import-resolver-typescript`. Everything else is
ESLint core. Two layers, both kept (neither is a superset):

- **`no-restricted-imports`** matches the _specifier string_ — catches
  `@nukesai-pos/backend`, `server-only`, `node:fs` outright.
- **`import-x/no-restricted-paths`** matches the _resolved file path_ — catches
  aliased and `.js`-suffixed TS imports that string matching misses. **The TS
  resolver is required**: with the default node resolver the zone rule silently
  passes (verified false-negative).

The rules ship as a factory (`boundaries({ packageDir, zone })`) because
`basePath` must be each package's own absolute dir — a shared static config
silently matches nothing. Zones: backend=`server`, frontend=`mixed`,
common=`isomorphic`, cli=none.

`@next/eslint-plugin-next` ships **no** server/client boundary rule — which is
why this config exists. React Compiler rules come bundled with
`eslint-plugin-react-hooks@7` (`configs.flat.recommended`); no separate
compiler plugin.

## 5. Testing the boundary

Lint checks source; the dist tests check **what we publish**. They walk each
package's `dist/` (root `pnpm test` builds first) and assert the contract
survived the build:

- every non-barrel `client/**` chunk keeps `"use client"`; barrels never carry it;
- no client chunk imports `server-only` or a node builtin;
- no server chunk is `"use client"`; **every** published backend entry keeps
  `import "server-only"` and resolves to the browser guard — both lists derived
  from the `exports` map, never hard-coded;
- `internal/browser-guard.js` exists and throws;
- `sideEffects` names every pill-bearing entry, and `browser` precedes `default`
  in every conditional export (order decides which condition wins);
- every glob and every derived set asserts a non-empty match (no vacuous passes),
  and every documented exemption must still name a real subpath.

A dropped directive or a tree-shaken poison pill is a silent,
ships-to-production class of bug that only these tests catch — both failure
modes were reproduced during research.
