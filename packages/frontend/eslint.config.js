import { BASE_SYNTAX_BANS } from "@nukesai-pos/eslint-config/base";
import {
  boundaries,
  CLIENT_SYNTAX_BANS,
  SERVER_SYNTAX_BANS,
  USE_CLIENT_BARREL_BAN,
} from "@nukesai-pos/eslint-config/boundaries";
import { createReactConfig } from "@nukesai-pos/eslint-config/react";

// The barrel ban is split per zone on purpose. A single `src/**/index.ts` block
// would replace `no-restricted-syntax` wholesale for EVERY barrel, which is
// exactly what used to happen: src/client/index.ts silently lost the client
// dynamic-import ban, so `await import("@nukesai-pos/backend")` in a barrel
// linted clean. Each block below re-states the bans of the zone it sits on.
// scripts/assert-lint-bans.mjs asserts the client barrel keeps them.
export default [
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "mixed" }),
  {
    name: "frontend/no-directive-on-barrels-client",
    files: ["src/client/index.ts", "src/client/index.tsx", "src/client/**/index.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...CLIENT_SYNTAX_BANS, USE_CLIENT_BARREL_BAN],
    },
  },
  {
    name: "frontend/no-directive-on-barrels-server",
    files: ["src/server/index.ts", "src/server/index.tsx", "src/server/**/index.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...SERVER_SYNTAX_BANS, USE_CLIENT_BARREL_BAN],
    },
  },
  {
    name: "frontend/no-directive-on-barrels-neutral",
    files: ["src/**/index.ts", "src/**/index.tsx"],
    ignores: ["src/client/**", "src/server/**"],
    rules: {
      "no-restricted-syntax": ["error", ...BASE_SYNTAX_BANS, USE_CLIENT_BARREL_BAN],
    },
  },
];
