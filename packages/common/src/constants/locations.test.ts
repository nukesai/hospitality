import { describe, expect, it } from "vitest";

import { DEMO_LOCATION_ID, toLocationId } from "./locations.js";

describe("toLocationId", () => {
  it("brands a non-empty string", () => {
    expect(toLocationId("branch-1")).toBe("branch-1");
  });

  it("rejects the empty string", () => {
    expect(() => toLocationId("")).toThrow("LocationId must be a non-empty string.");
  });

  it("exposes the demo location", () => {
    expect(DEMO_LOCATION_ID).toBe("demo-main");
  });
});
