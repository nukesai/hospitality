import { createBaseConfig } from "@nukesai-pos/eslint-config/base";
import { boundaries } from "@nukesai-pos/eslint-config/boundaries";

export default [
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries({ packageDir: import.meta.dirname, zone: "isomorphic" }),
];
