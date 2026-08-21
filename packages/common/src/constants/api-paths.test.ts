import { describe, expect, it } from "vitest";

import { DEFAULT_POS_API_BASE_PATH, posApiPaths } from "./api-paths.js";

describe("posApiPaths", () => {
  it("fans the default base path out to every surface", () => {
    expect(posApiPaths()).toEqual({
      basePath: "/api/pos",
      auth: "/api/pos/auth",
      trpc: "/api/pos/trpc",
      rest: "/api/pos/rest",
      openApiJson: "/api/pos/openapi.json",
      docs: "/api/pos/docs",
    });
    expect(DEFAULT_POS_API_BASE_PATH).toBe("/api/pos");
  });

  it("accepts a custom mount and drops a trailing slash", () => {
    expect(posApiPaths("/internal/pos/").trpc).toBe("/internal/pos/trpc");
  });

  it("rejects a relative base path", () => {
    expect(() => posApiPaths("api/pos")).toThrow('must start with "/"');
  });

  it("rejects the bare root (would shadow the whole app)", () => {
    expect(() => posApiPaths("/")).toThrow('not be "/"');
  });
});
