import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createPosProxy, POS_PROXY_MATCHER } from "./create-pos-proxy.js";

describe("createPosProxy", () => {
  it("negotiates locales for the default routing (as-needed: / serves the default locale)", async () => {
    const proxy = createPosProxy();
    const response = await proxy(new NextRequest("http://localhost:3100/"));
    // Default locale unprefixed -> internal rewrite, not a redirect.
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/en");
  });

  it("redirects a prefixed default-locale URL back to the clean path", async () => {
    const proxy = createPosProxy();
    const response = await proxy(new NextRequest("http://localhost:3100/en/admin"));
    expect([301, 302, 307, 308]).toContain(response.status);
    expect(response.headers.get("location")).toBe("http://localhost:3100/admin");
  });

  it("serves non-default locales under their prefix without redirecting", async () => {
    const proxy = createPosProxy();
    const response = await proxy(new NextRequest("http://localhost:3100/ne/admin"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull(); // already localized — pass through
  });

  it("honors custom routing and publishes the matcher templates inline", async () => {
    const proxy = createPosProxy({ locales: ["de"], defaultLocale: "de", localePrefix: "always" });
    const response = await proxy(new NextRequest("http://localhost:3100/"));
    expect([301, 302, 307, 308]).toContain(response.status);
    expect(response.headers.get("location")).toBe("http://localhost:3100/de");
    expect(POS_PROXY_MATCHER.startsWith("/((?!api|trpc|_next|_vercel")).toBe(true);
  });

  it("passes POS API requests straight through (any POS_API_BASE_PATH, not just /api)", async () => {
    const proxy = createPosProxy(undefined, { apiBasePath: "/pos-api" });
    for (const url of ["http://localhost:3100/pos-api", "http://localhost:3100/pos-api/trpc/x"]) {
      const response = await proxy(new NextRequest(url));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull(); // never locale-redirected
    }
    // A path that merely starts with the same characters is NOT the API.
    const sibling = await proxy(new NextRequest("http://localhost:3100/pos-apidocs"));
    expect(sibling.headers.get("x-middleware-next")).toBeNull();
  });

  it("defaults the API passthrough to the packaged base path", async () => {
    const response = await createPosProxy()(new NextRequest("http://localhost:3100/api/pos/trpc"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
