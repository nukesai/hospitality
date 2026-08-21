import { createBaseConfig } from "@nukesai-pos/eslint-config/base";
import { boundaries, withI18nFrameworkBan } from "@nukesai-pos/eslint-config/boundaries";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "server" }),
  {
    name: "backend/no-ui",
    files: ["src/**/*.ts"],
    rules: {
      // NOTE: flat config replaces rule options WHOLESALE — this block must
      // restate the serverZone patterns from
      // @nukesai-pos/eslint-config/boundaries, or it would silently wipe them.
      // withI18nFrameworkBan folds the §7 i18n ban back in for the same reason
      // (scripts/assert-lint-bans.mjs proves both survive).
      "no-restricted-imports": withI18nFrameworkBan([
        "error",
        {
          paths: [
            { name: "react", message: "@nukesai-pos/backend never renders UI." },
            { name: "react-dom", message: "@nukesai-pos/backend never renders UI." },
          ],
          patterns: [
            {
              group: [
                "@nukesai-pos/frontend",
                "@nukesai-pos/frontend/**",
                "react/*",
                "react-dom/*",
              ],
              message: "@nukesai-pos/backend never imports UI code.",
            },
            {
              // Restated from boundaries.js serverZone (wholesale-replacement rule).
              group: [
                "client-only",
                "react-dom/client",
                "**/client",
                "**/client/**",
                "*.client",
                "*.client.*",
              ],
              message:
                "server code must not import client code. See docs/architecture/isolation.md.",
            },
          ],
        },
      ]),
    },
  },
];
