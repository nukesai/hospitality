import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import { createBaseConfig } from "./base.js";

/**
 * React + Next layer. Exact config paths matter:
 * - reactHooks.configs.flat.recommended (NOT .configs.recommended — that is the
 *   legacy eslintrc shape and breaks flat config). Ships the bundled React
 *   Compiler rules under the react-hooks/ namespace.
 * - nextPlugin.configs['core-web-vitals'] is ALREADY flat in 16.3.1.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function createReactConfig({ tsconfigRootDir }) {
  return tseslint.config(
    ...createBaseConfig({ tsconfigRootDir }),

    {
      name: "nukes/react-globals",
      files: ["**/*.{ts,tsx}"],
      languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
    },

    {
      name: "nukes/react-hooks",
      files: ["**/*.{ts,tsx}"],
      ...reactHooks.configs.flat.recommended,
    },

    {
      name: "nukes/next",
      files: ["**/*.{ts,tsx}"],
      ...nextPlugin.configs["core-web-vitals"],
    },

    {
      name: "nukes/next-overrides",
      files: ["**/*.{ts,tsx}"],
      rules: {
        // App-router-only repo: this rule prints "Pages directory cannot be
        // found" on every single lint run. Verified.
        "@next/next/no-html-link-for-pages": "off",
      },
    },
  );
}
