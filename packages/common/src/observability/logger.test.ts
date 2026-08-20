import { describe, expect, it } from "vitest";

import { LOG_LEVELS, noopLogger } from "./logger.js";

describe("noopLogger", () => {
  it("accepts every level without throwing and returns itself for child()", async () => {
    for (const level of LOG_LEVELS) {
      expect(() => {
        noopLogger[level]("message", { requestId: "r1" });
      }).not.toThrow();
    }
    expect(noopLogger.child({ requestId: "r1" })).toBe(noopLogger);
    await expect(noopLogger.flush()).resolves.toBeUndefined();
  });
});
