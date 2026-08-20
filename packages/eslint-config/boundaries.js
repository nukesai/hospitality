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
              // "**/client" additionally catches barrel-directory imports like "../client".
              "**/client",
              "**/client/**",
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
              // "**/server" additionally catches barrel-directory imports like "../server".
              "**/server",
              "**/server/**",
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

/**
 * Mixed packages: every source file MUST live in src/client/** or src/server/**.
 * Without this, a file in e.g. src/shared/ would be completely unzoned.
 */
export const mixedStructureZone = {
  name: "nukes/boundary/mixed-structure",
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/client/**", "src/server/**"],
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
      return [...base, { ...serverZone, files: ["src/**/*.{ts,tsx}"] }];
    case "client":
      return [...base, { ...clientZone, files: ["src/**/*.{ts,tsx}"] }];
    case "isomorphic":
      return [...base, isomorphicZone];
    case "mixed":
      return [...base, serverZone, clientZone, mixedStructureZone];
    default:
      throw new Error(`Unknown zone: ${String(zone)}`);
  }
}
