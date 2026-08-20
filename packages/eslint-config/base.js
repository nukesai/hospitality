import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import turbo from "eslint-plugin-turbo";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared strict, type-aware base config. Exported as a FACTORY so each package
 * passes its own tsconfigRootDir — this is what makes projectService work
 * correctly per-package in a monorepo.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir - pass `import.meta.dirname`
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function createBaseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      name: "nukes/ignores",
      ignores: [
        "**/dist/**",
        "**/.next/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/node_modules/**",
        "**/templates/**",
        "**/*.gen.ts",
      ],
    },

    { name: "nukes/js-recommended", ...js.configs.recommended },
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    turbo.configs["flat/recommended"],

    {
      name: "nukes/language-options",
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        parserOptions: {
          projectService: {
            allowDefaultProject: ["*.js", "*.mjs", "*.cjs"],
            defaultProject: "tsconfig.json",
          },
          tsconfigRootDir,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: "error",
        reportUnusedInlineConfigs: "error",
      },
    },

    {
      name: "nukes/library-rules",
      files: ["**/*.{ts,tsx,mts,cts}"],
      rules: {
        // --- published-package hygiene (tree-shaking + d.ts correctness) ---
        "@typescript-eslint/consistent-type-imports": [
          "error",
          {
            prefer: "type-imports",
            fixStyle: "inline-type-imports",
            disallowTypeAnnotations: true,
          },
        ],
        "@typescript-eslint/consistent-type-exports": [
          "error",
          { fixMixedExportsWithInlineTypeSpecifier: true },
        ],
        "@typescript-eslint/no-import-type-side-effects": "error",
        // Also the authoring aid for isolatedDeclarations (TS9013).
        "@typescript-eslint/explicit-module-boundary-types": "error",

        // --- correctness ---
        "@typescript-eslint/no-floating-promises": ["error", { checkThenables: true }],
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/promise-function-async": "error",
        "@typescript-eslint/require-await": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],

        // --- house style ---
        "no-console": ["error", { allow: ["warn", "error"] }],
        "no-restricted-syntax": [
          "error",
          {
            selector: "TSEnumDeclaration",
            message:
              "Use a const object + union type. Enums are not erasable and break erasableSyntaxOnly/tsdown output.",
          },
        ],
      },
    },

    // Plain JS (config files, scripts) must opt OUT of type-aware rules.
    {
      name: "nukes/js-untyped",
      files: ["**/*.{js,mjs,cjs}"],
      languageOptions: { globals: globals.node },
      extends: [tseslint.configs.disableTypeChecked],
    },

    {
      name: "nukes/tests",
      files: ["**/*.{test,spec}.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },

    // MUST be last: turns off everything Prettier owns.
    prettier,
  );
}
