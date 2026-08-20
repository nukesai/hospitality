import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Full-stack API flow against the Docker stack (postgres+redis+mailpit):
 * sign-up -> mailpit verification -> sign-in -> create branch -> set active ->
 * orders create/list through RLS with cache invalidation -> guard checks.
 * Requires `pnpm stack:up && pnpm db:migrate` — set E2E_STACK=1 to enable.
 */
const STACK = process.env.E2E_STACK === "1";
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";

test.describe("API flow (live stack)", () => {
  test.skip(!STACK, "E2E_STACK=1 required (docker stack + migrations)");
  test.describe.configure({ mode: "serial" });

  const email = `e2e-${String(Date.now())}@nukesai.test`;
  const password = "SuperSecret123!";
  let api: APIRequestContext;
  let branchId: string;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL: baseURL ?? "http://127.0.0.1:3100",
      extraHTTPHeaders: { origin: baseURL ?? "http://127.0.0.1:3100" },
    });
  });
  test.afterAll(async () => {
    await api.dispose();
  });

  test("sign-up sends a verification mail through mailpit", async () => {
    const res = await api.post("/api/pos/auth/sign-up/email", {
      data: { name: "E2E Owner", email, password },
    });
    expect(res.ok()).toBe(true);
    await expect(async () => {
      const search = (await (await fetch(`${MAILPIT}/api/v1/search?query=to:${email}`)).json()) as {
        messages: { ID: string }[];
      };
      expect(search.messages.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });

  test("email verification link works and sign-in succeeds", async () => {
    const search = (await (await fetch(`${MAILPIT}/api/v1/search?query=to:${email}`)).json()) as {
      messages: { ID: string }[];
    };
    const message = (await (
      await fetch(`${MAILPIT}/api/v1/message/${search.messages[0]?.ID ?? ""}`)
    ).json()) as { Text: string };
    const link = /https?:\/\/\S+verify-email\S+/.exec(message.Text)?.[0];
    expect(link).toBeTruthy();
    await api.get(link ?? "");
    const signIn = await api.post("/api/pos/auth/sign-in/email", { data: { email, password } });
    expect(signIn.ok()).toBe(true);
  });

  test("create branch and set it active", async () => {
    const created = await api.post("/api/pos/auth/organization/create", {
      data: { name: "E2E Branch", slug: `e2e-${String(Date.now())}` },
    });
    expect(created.ok()).toBe(true);
    branchId = ((await created.json()) as { id: string }).id;
    const active = await api.post("/api/pos/auth/organization/set-active", {
      data: { organizationId: branchId },
    });
    expect(active.ok()).toBe(true);
  });

  test("orders: create invalidates the cached list (RLS + cache discipline)", async () => {
    const listUrl = "/api/pos/trpc/orders.list?input=%7B%22json%22%3A%7B%7D%7D";
    const before = (await (await api.get(listUrl)).json()) as {
      result: { data: { json: { items: unknown[] } } };
    };
    const baseline = before.result.data.json.items.length;

    const created = await api.post("/api/pos/trpc/orders.create", {
      data: { json: { total: "13.37" } },
    });
    expect(created.ok()).toBe(true);

    const after = (await (await api.get(listUrl)).json()) as {
      result: { data: { json: { items: { branchId: string; total: string }[] } } };
    };
    expect(after.result.data.json.items.length).toBe(baseline + 1);
    for (const item of after.result.data.json.items) expect(item.branchId).toBe(branchId);
  });

  test("guards: 403 on branch mismatch, 422 on bad input, canary absent in prod", async () => {
    const mismatch = await api.get("/api/pos/trpc/orders.list?input=%7B%22json%22%3A%7B%7D%7D", {
      headers: { "x-branch-id": "00000000-0000-4000-8000-00000000dead" },
    });
    expect(mismatch.status()).toBe(403);

    const invalid = await api.post("/api/pos/trpc/orders.create", {
      data: { json: { total: "not-money" } },
    });
    expect(invalid.status()).toBe(422);

    // The cache-discipline canary is DEV-ONLY (review fix): a production build
    // must not expose it at all. enforceCacheMeta itself is unit-tested.
    const canary = await api.post("/api/pos/trpc/orders._cacheCanary", { data: { json: {} } });
    expect(canary.status()).toBe(404);
  });

  test("unauthenticated tRPC call is 401", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL: baseURL ?? "" });
    const res = await anon.get("/api/pos/trpc/orders.list?input=%7B%22json%22%3A%7B%7D%7D");
    expect(res.status()).toBe(401);
    await anon.dispose();
  });
});

test.describe("API surfaces (no DB needed)", () => {
  test.skip(!STACK, "E2E_STACK=1 required (server boots against the stack)");

  test("OpenAPI 3.1 document is served with the bearer scheme", async ({ request }) => {
    const doc = (await (await request.get("/api/pos/openapi.json")).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toContain("/health");
    expect(doc.components.securitySchemes).toHaveProperty("bearerAuth");
  });

  test("Scalar docs render", async ({ request }) => {
    const html = await (await request.get("/api/pos/docs")).text();
    expect(html).toContain("Scalar API Reference");
  });

  test("REST health endpoint answers", async ({ request }) => {
    const body = (await (await request.get("/api/pos/rest/health?echo=e2e")).json()) as {
      ok: boolean;
      echo: string;
    };
    expect(body.ok).toBe(true);
    expect(body.echo).toBe("e2e");
  });
});
