import { boundaries } from "@nukesai-pos/eslint-config/boundaries";
import { createReactConfig } from "@nukesai-pos/eslint-config/react";

export default [
  ...createReactConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "mixed" }),
  {
    name: "frontend/no-directive-on-barrels",
    files: ["src/**/index.ts", "src/**/index.tsx"],
    rules: {
      // A "use client" barrel becomes a single client boundary and leaks every
      // unused export into the consumer's client bundle (verified). Leaves only.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement > Literal[value='use client']",
          message:
            'Never put "use client" on a barrel/index file — it drags the whole package into the consumer\'s client bundle. Mark the leaf component instead.',
        },
        {
          selector: "TSEnumDeclaration",
          message:
            "Use a const object + union type. Enums are not erasable and break erasableSyntaxOnly/tsdown output.",
        },
      ],
    },
  },
];
