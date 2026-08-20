import { describe, expect, it } from "vitest";

import { errorMessage } from "./messages.js";

describe("errorMessage", () => {
  it("unwraps Error instances", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error throw values", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(42)).toBe("42");
  });
});
