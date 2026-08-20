import { createReactConfig } from "@nukesai-pos/eslint-config/react";

export default [...createReactConfig({ tsconfigRootDir: import.meta.dirname })];
