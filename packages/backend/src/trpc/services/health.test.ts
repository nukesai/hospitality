import { describe, expect, it } from "vitest";

import { healthCheck, healthInput, healthOutput } from "./health.js";

describe("healthInput", () => {
  it("accepts an empty object (echo optional)", () => {
    expect(healthInput.safeParse({}).success).toBe(true);
  });

  it("accepts a short echo string", () => {
    expect(healthInput.safeParse({ echo: "ping" }).success).toBe(true);
  });

  it("rejects an echo longer than 120 characters", () => {
    expect(healthInput.safeParse({ echo: "x".repeat(121) }).success).toBe(false);
  });

  it("rejects a non-string echo", () => {
    expect(healthInput.safeParse({ echo: 42 }).success).toBe(false);
  });
});

describe("healthOutput", () => {
  it("accepts a wire-safe result with echo null", () => {
    expect(
      healthOutput.safeParse({ ok: true, service: "nukesai-pos-backend", echo: null }).success,
    ).toBe(true);
  });

  it("accepts a result with a string echo", () => {
    expect(healthOutput.safeParse({ ok: true, service: "svc", echo: "hi" }).success).toBe(true);
  });

  it("rejects a result missing echo (undefined is not wire-safe)", () => {
    expect(healthOutput.safeParse({ ok: true, service: "svc" }).success).toBe(false);
  });

  it("rejects a non-boolean ok", () => {
    expect(healthOutput.safeParse({ ok: "yes", service: "svc", echo: null }).success).toBe(false);
  });
});

describe("healthCheck", () => {
  it("echoes the provided string", () => {
    expect(healthCheck({ echo: "hello" })).toEqual({
      ok: true,
      service: "nukesai-pos-backend",
      echo: "hello",
    });
  });

  it("maps an absent echo to null", () => {
    expect(healthCheck({})).toEqual({ ok: true, service: "nukesai-pos-backend", echo: null });
  });

  it("maps an explicitly undefined echo to null", () => {
    expect(healthCheck({ echo: undefined }).echo).toBeNull();
  });
});
