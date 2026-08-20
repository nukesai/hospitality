import { beforeAll } from "vitest";

// Enforces the SSR-only contract: if any import in @nukesai-pos/backend reaches
// for a browser global, fail fast rather than passing under jsdom-ish leakage.
// `navigator` is deliberately NOT checked: Node >= 21 ships a global navigator.
beforeAll(() => {
  for (const domGlobal of ["window", "document", "localStorage"]) {
    if (domGlobal in globalThis) {
      throw new Error(
        `@nukesai-pos/backend is server-only but "${domGlobal}" is present in the test environment.`,
      );
    }
  }
});
