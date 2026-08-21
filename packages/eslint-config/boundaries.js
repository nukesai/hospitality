/**
 * @nukesai-pos/eslint-config/boundaries
 *
 * SSR/CSR isolation rules. Consumed per-package because `no-restricted-paths`
 * needs an absolute `basePath` pointing at THAT package, not at this config.
 *
 *   // packages/backend/eslint.config.js
 *   import { boundaries } from "@nukesai-pos/eslint-config/boundaries";
 *   export default [...boundaries({ packageDir: import.meta.dirname, zone: "server" })];
 */
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importX from "eslint-plugin-import-x";

import { BASE_SYNTAX_BANS } from "./base.js";

const SERVER_PKGS = ["@nukesai-pos/backend", "@nukesai-pos/backend/**"];
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "location",
  "history",
];

const DOC = "See docs/architecture/isolation.md.";

/** Shared resolver so `no-restricted-paths` can follow `./x.js` -> `./x.ts`.
 *  REQUIRED: with the default node resolver the zone rule silently passes. */
const tsResolver = (packageDir) => ({
  "import-x/resolver-next": [
    createTypeScriptImportResolver({
      project: `${packageDir}/tsconfig.json`,
      alwaysTryTypes: true,
    }),
  ],
});

/** Directory zones, enforced on RESOLVED paths. */
export const zoneConfig = ({ packageDir }) => ({
  name: "nukes/boundary/zones",
  files: ["src/**/*.{ts,tsx}"],
  plugins: { "import-x": importX },
  settings: tsResolver(packageDir),
  rules: {
    "import-x/no-unresolved": "error",
    "import-x/no-restricted-paths": [
      "error",
      {
        basePath: packageDir,
        zones: [
          {
            target: "./src/client",
            from: "./src/server",
            message: `client/** must never import server/**. ${DOC}`,
          },
        ],
      },
    ],
  },
});

/** Server-graph rules (RSC/Node only). */
export const serverZone = {
  name: "nukes/boundary/server",
  files: ["src/server/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "client-only",
              "react-dom/client",
              // Relative-path shapes only: bare "**/client" would false-positive
              // on packages like "better-auth/client". The import-x resolved-path
              // zone rule covers aliased/indirect cases.
              "./client",
              "../client",
              "../../client",
              "./client/**",
              "../client/**",
              "../../client/**",
              "*.client",
              "*.client.*",
            ],
            message: `server code must not import client code. ${DOC}`,
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...DOM_GLOBALS.map((name) => ({ name, message: `server code has no DOM. ${DOC}` })),
    ],
    // no-restricted-imports does NOT see dynamic import(); ban the literal forms.
    // BASE_SYNTAX_BANS is spread back in because flat config replaces rule
    // options wholesale.
    "no-restricted-syntax": [
      "error",
      ...BASE_SYNTAX_BANS,
      {
        selector: "ImportExpression > Literal[value=/client/]",
        message: `server code must not dynamically import client modules. ${DOC}`,
      },
    ],
  },
};

/** Client-graph rules (ships to the browser). */
export const clientZone = {
  name: "nukes/boundary/client",
  files: ["src/client/**/*.{ts,tsx}"],
  plugins: { "import-x": importX },
  rules: {
    // Proper builtin detection (bare AND node:-prefixed) — a bare-name string
    // list would false-positive on relative paths like ./constants/.
    "import-x/no-nodejs-modules": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              ...SERVER_PKGS,
              "server-only",
              // Relative-path shapes only: bare "**/server" would false-positive
              // on packages like "@trpc/server". The import-x resolved-path zone
              // rule covers aliased/indirect cases.
              "./server",
              "../server",
              "../../server",
              "./server/**",
              "../server/**",
              "../../server/**",
              "*.server",
              "*.server.*",
            ],
            message: `Client code must never import @nukesai-pos/backend or any server module. ${DOC}`,
          },
        ],
      },
    ],
    // no-restricted-imports does NOT see dynamic import(); ban the literal forms.
    "no-restricted-syntax": [
      "error",
      ...BASE_SYNTAX_BANS,
      {
        selector:
          "ImportExpression > Literal[value=/@nukesai-pos\\u002Fbackend|server-only|\\u002Fserver/]",
        message: `Client code must never dynamically import server modules. ${DOC}`,
      },
    ],
  },
};

/** Isomorphic rules — must be byte-identical-safe on both sides. */
export const isomorphicZone = {
  name: "nukes/boundary/isomorphic",
  files: ["src/**/*.{ts,tsx}"],
  plugins: { "import-x": importX },
  rules: {
    // Proper builtin detection (bare AND node:-prefixed) — a bare-name string
    // list would false-positive on relative paths like ./constants/.
    "import-x/no-nodejs-modules": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              ...SERVER_PKGS,
              "@nukesai-pos/frontend",
              "@nukesai-pos/frontend/**",
              "server-only",
              "client-only",
            ],
            message: `@nukesai-pos/common is a leaf package and imports neither sibling nor a runtime pin. ${DOC}`,
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...[...DOM_GLOBALS, "process", "global", "__dirname", "__filename"].map((name) => ({
        name,
        message: `isomorphic code must not touch runtime-specific globals; inject instead. ${DOC}`,
      })),
    ],
    "no-restricted-properties": [
      "error",
      {
        object: "process",
        property: "env",
        message: `isomorphic code must not read process.env; take config as a parameter. ${DOC}`,
      },
    ],
  },
};

/** AGENTS.md §7: no i18n FRAMEWORK ever enters common or backend — catalogs are
 * plain data and the dependency-free common translator serves the server side.
 *
 * Exported as DATA, never as a standalone config block: ESLint flat config
 * replaces rule options WHOLESALE, so a second block targeting the same files
 * and the same `no-restricted-imports` rule silently deletes the bans declared
 * before it (that is exactly how the leaf-package ban was lost once). Merge it
 * with `withI18nFrameworkBan` into the block that already owns the rule.
 */
const I18N_FRAMEWORKS = ["i18next", "react-i18next", "next-intl", "use-intl"];
const I18N_MESSAGE = `i18n frameworks live in @nukesai-pos/frontend only; common/backend use the dependency-free translator. ${DOC}`;

export const i18nFrameworkPaths = I18N_FRAMEWORKS.map((name) => ({
  name,
  message: I18N_MESSAGE,
}));
export const i18nFrameworkPatterns = [
  { group: I18N_FRAMEWORKS.map((name) => `${name}/*`), message: I18N_MESSAGE },
];

/**
 * Merge the i18n ban INTO an existing `no-restricted-imports` rule entry.
 * @param {unknown} entry the zone's current ["error", options] tuple
 * @returns {unknown[]} a tuple carrying both the zone's bans and the i18n ban
 */
export function withI18nFrameworkBan(entry) {
  const options = Array.isArray(entry) && typeof entry[1] === "object" ? entry[1] : {};
  return [
    "error",
    {
      ...options,
      paths: [...(options.paths ?? []), ...i18nFrameworkPaths],
      patterns: [...(options.patterns ?? []), ...i18nFrameworkPatterns],
    },
  ];
}

/** Apply the ban to a zone config without dropping any of its other rules. */
const banI18n = (config) => ({
  ...config,
  rules: {
    ...config.rules,
    "no-restricted-imports": withI18nFrameworkBan(config.rules["no-restricted-imports"]),
  },
});

/**
 * Mixed packages: every source file MUST live in src/client/** or src/server/**.
 * Without this, a file in e.g. src/shared/ would be completely unzoned.
 */
export const mixedStructureZone = {
  name: "nukes/boundary/mixed-structure",
  files: ["src/**/*.{ts,tsx}"],
  // i18n/ and locales/ are the documented NEUTRAL subpaths (no runtime pin,
  // importable from both graphs); next-config/ and proxy/ are NODE-side config
  // surfaces loaded by next.config.ts / proxy.ts, which run WITHOUT the
  // react-server condition, so they must never carry the server-only pill.
  // Everything else must pick a side.
  ignores: [
    "src/client/**",
    "src/server/**",
    "src/i18n/**",
    "src/locales/**",
    "src/next-config/**",
    "src/proxy/**",
  ],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Program",
        message: `In a mixed package every source file must live in src/client/ or src/server/ (shared code belongs in @nukesai-pos/common). ${DOC}`,
      },
    ],
  },
};

/**
 * @param {{ packageDir: string, zone: "server" | "client" | "isomorphic" | "mixed" }} opts
 * @returns {import("eslint").Linter.Config[]}
 */
export function boundaries({ packageDir, zone }) {
  const base = [zoneConfig({ packageDir })];
  switch (zone) {
    case "server":
      // Whole package is server code, not just src/server/**.
      return [...base, banI18n({ ...serverZone, files: ["src/**/*.{ts,tsx}"] })];
    case "client":
      return [...base, { ...clientZone, files: ["src/**/*.{ts,tsx}"] }];
    case "isomorphic":
      return [...base, banI18n(isomorphicZone)];
    case "mixed":
      return [...base, serverZone, clientZone, mixedStructureZone];
    default:
      throw new Error(`Unknown zone: ${String(zone)}`);
  }
}
