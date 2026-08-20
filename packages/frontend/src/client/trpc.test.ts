import { describe, expect, it } from "vitest";

import { createPosQueryClient, createPosTrpcLinks, getPosQueryClient } from "./trpc.js";

describe("createPosTrpcLinks", () => {
  it("builds a single streaming batch link, with and without headers", () => {
    expect(createPosTrpcLinks({ url: "http://x/api/trpc" })).toHaveLength(1);
    expect(
      createPosTrpcLinks({ url: "http://x/api/trpc", headers: () => ({ "x-branch-id": "b1" }) }),
    ).toHaveLength(1);
  });
});

describe("query clients", () => {
  it("createPosQueryClient applies conservative defaults", () => {
    const client = createPosQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(5_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.retry).toBe(1);
  });

  it("getPosQueryClient is a singleton in the browser (jsdom)", () => {
    expect(getPosQueryClient()).toBe(getPosQueryClient());
  });
});
