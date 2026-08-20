import { describe, expect, it, vi } from "vitest";

import type { PosAuth } from "../auth/index.js";
import { createAuthRouteHandlers } from "./auth-handlers.js";

const makeFakeAuth = (): { auth: PosAuth; handler: ReturnType<typeof vi.fn> } => {
  const handler = vi.fn(async (req: Request): Promise<Response> => {
    await Promise.resolve();
    return new Response(`ok:${req.method}`);
  });
  return { auth: { handler } as unknown as PosAuth, handler };
};

describe("createAuthRouteHandlers", () => {
  it("routes GET requests through auth.handler", async () => {
    const { auth, handler } = makeFakeAuth();
    const { GET } = createAuthRouteHandlers(auth);
    const request = new Request("http://localhost/api/auth/get-session");
    const response = await GET(request);
    await expect(response.text()).resolves.toBe("ok:GET");
    expect(handler).toHaveBeenCalledExactlyOnceWith(request);
  });

  it("routes POST requests through auth.handler", async () => {
    const { auth, handler } = makeFakeAuth();
    const { POST } = createAuthRouteHandlers(auth);
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      body: "{}",
    });
    const response = await POST(request);
    await expect(response.text()).resolves.toBe("ok:POST");
    expect(handler).toHaveBeenCalledExactlyOnceWith(request);
  });
});
