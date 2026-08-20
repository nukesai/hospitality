import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// REQUIRED because `globals: false` — @testing-library/react@16 only
// self-registers cleanup when a global afterEach exists.
afterEach(() => {
  cleanup();
});
