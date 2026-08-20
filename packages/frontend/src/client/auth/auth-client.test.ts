import { describe, expect, it } from "vitest";

import { createPosAuthClient, resolveBearerToken } from "./auth-client.js";

describe("createPosAuthClient", () => {
  it("builds a cookie-based client with the organization plugin", () => {
    const client = createPosAuthClient({ baseUrl: "http://127.0.0.1:3100" });
    expect(client.signIn).toBeDefined();
    expect(client.organization).toBeDefined();
    expect(client.organization.setActive).toBeTypeOf("function");
  });

  it("resolveBearerToken is null-safe and empty-string based", () => {
    expect(resolveBearerToken(() => "tok-123")).toBe("tok-123");
    expect(resolveBearerToken(() => null)).toBe("");
    expect(resolveBearerToken(undefined)).toBe("");
  });

  it("wires bearer auth for mobile (token callback, null-safe)", () => {
    const withToken = createPosAuthClient({
      baseUrl: "http://127.0.0.1:3100",
      getBearerToken: () => "tok-123",
    });
    expect(withToken.useSession).toBeDefined();
    const withNull = createPosAuthClient({
      baseUrl: "http://127.0.0.1:3100",
      getBearerToken: () => null,
    });
    expect(withNull.signOut).toBeTypeOf("function");
  });
});
