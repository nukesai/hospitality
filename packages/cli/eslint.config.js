import { createBaseConfig } from "@nukesai-pos/eslint-config/base";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    name: "cli/terminal-output",
    files: ["src/**/*.ts"],
    rules: {
      // A CLI's job is to print. Structured output goes through @clack/prompts,
      // but plain console is legitimate here.
      "no-console": "off",
    },
  },
];
