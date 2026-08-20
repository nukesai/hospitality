import { describe, expect, it } from "vitest";

describe("browser guard", () => {
  it("throws immediately when evaluated (the browser condition resolves here)", async () => {
    await expect(import("./browser-guard.js")).rejects.toThrow(
      /server-only and cannot be imported/,
    );
  });
});
