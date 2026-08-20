import { createBaseConfig } from "@nukesai-pos/eslint-config/base";
import { boundaries } from "@nukesai-pos/eslint-config/boundaries";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "server" }),
  {
    name: "backend/no-ui",
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
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
          ],
        },
      ],
    },
  },
];
