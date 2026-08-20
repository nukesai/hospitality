// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getPosQueryClient } from "./trpc.js";

describe("getPosQueryClient on the server", () => {
  it("returns a FRESH client per call — no cross-request leakage", () => {
    expect(getPosQueryClient()).not.toBe(getPosQueryClient());
  });
});
