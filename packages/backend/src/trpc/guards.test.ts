import { noopLogger } from "@nukesai-pos/common";
import { AppError } from "@nukesai-pos/common/errors";
import { describe, expect, it } from "vitest";

import type { KvPort } from "../ports/kv.js";
import { checkRateLimit, requireBranch, requireRole, requireSession } from "./guards.js";
import type { BranchAuthorization } from "./guards.js";
import type { PosSessionInfo, PosTrpcContext, PosTrpcDeps } from "./init.js";
import { createMemoryKv } from "../adapters/cache/memory.js";

interface CtxOptions {
  readonly session?: PosSessionInfo | null;
  readonly requestedBranchId?: string | null;
  readonly ip?: string | null;
  readonly member?: { readonly role: string } | null;
  readonly kv?: KvPort | null;
}

const createCtx = (options: CtxOptions = {}): PosTrpcContext => {
  const deps = {
    auth: {
      api: {
        getActiveMember: async (): Promise<{ readonly role: string } | null> =>
          Promise.resolve(options.member ?? null),
      },
    },
    kv: options.kv ?? null,
  } as unknown as PosTrpcDeps;
  return {
    session: options.session ?? null,
    requestedBranchId: options.requestedBranchId ?? null,
    requestHeaders: new Headers(),
    ip: options.ip ?? null,
    requestId: "req-1",
    logger: noopLogger,
    t: { t: (key: string): string => key },
    deps,
  };
};

const SESSION: PosSessionInfo = { userId: "user-1", activeBranchId: "branch-1" };

describe("requireSession", () => {
  it("throws UNAUTHENTICATED when there is no session", () => {
    let caught: unknown;
    try {
      requireSession(createCtx());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      code: "UNAUTHENTICATED",
      httpStatus: 401,
      context: { requestId: "req-1" },
    });
  });

  it("returns the session when present", () => {
    expect(requireSession(createCtx({ session: SESSION }))).toEqual({ session: SESSION });
  });
});

describe("requireBranch", () => {
  it("rejects with the 401 UNAUTHENTICATED AppError when there is no session", async () => {
    const promise = requireBranch(createCtx());
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(requireBranch(createCtx())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      httpStatus: 401,
    });
  });

  it("rejects when the session has no active branch", async () => {
    const ctx = createCtx({ session: { userId: "user-1", activeBranchId: null } });
    await expect(requireBranch(ctx)).rejects.toMatchObject({
      code: "BRANCH_ACCESS_DENIED",
      httpStatus: 403,
      message: "No active branch on session",
    });
  });

  it("rejects when x-branch-id disagrees with the active branch", async () => {
    const ctx = createCtx({ session: SESSION, requestedBranchId: "branch-2" });
    await expect(requireBranch(ctx)).rejects.toMatchObject({
      code: "BRANCH_ACCESS_DENIED",
      httpStatus: 403,
      context: { branchId: "branch-1", userId: "user-1" },
    });
  });

  it("rejects when the caller is not a member of the active branch", async () => {
    const ctx = createCtx({ session: SESSION, member: null });
    await expect(requireBranch(ctx)).rejects.toMatchObject({
      code: "BRANCH_ACCESS_DENIED",
      message: "Caller is not a member of the active branch",
    });
  });

  it("rejects when the member role is not a POS role", async () => {
    const ctx = createCtx({ session: SESSION, member: { role: "superuser" } });
    await expect(requireBranch(ctx)).rejects.toMatchObject({ code: "BRANCH_ACCESS_DENIED" });
  });

  it("rejects with ROLE_FORBIDDEN when the permission matrix denies the check", async () => {
    const ctx = createCtx({ session: SESSION, member: { role: "kitchen" } });
    await expect(
      requireBranch(ctx, { resource: "payments", action: "read" }),
    ).rejects.toMatchObject({
      code: "ROLE_FORBIDDEN",
      httpStatus: 403,
      message: "kitchen lacks read on payments",
    });
  });

  it("returns the rls triple when no permission check is requested", async () => {
    const ctx = createCtx({ session: SESSION, member: { role: "waiter" } });
    await expect(requireBranch(ctx)).resolves.toEqual({
      rls: { userId: "user-1", branchId: "branch-1", role: "waiter" },
    });
  });

  it("passes when x-branch-id matches and the permission check succeeds", async () => {
    const ctx = createCtx({
      session: SESSION,
      requestedBranchId: "branch-1",
      member: { role: "kitchen" },
    });
    await expect(requireBranch(ctx, { resource: "orders", action: "read" })).resolves.toEqual({
      rls: { userId: "user-1", branchId: "branch-1", role: "kitchen" },
    });
  });
});

describe("requireRole", () => {
  const authorization: BranchAuthorization = {
    rls: { userId: "user-1", branchId: "branch-1", role: "waiter" },
  };

  it("passes when the role is allowed", () => {
    expect(() => {
      requireRole(authorization, ["owner", "waiter"], "req-1");
    }).not.toThrow();
  });

  it("throws ROLE_FORBIDDEN when the role is not allowed", () => {
    let caught: unknown;
    try {
      requireRole(authorization, ["owner", "admin"], "req-9");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      code: "ROLE_FORBIDDEN",
      message: "Role waiter not in [owner, admin]",
      context: { requestId: "req-9" },
    });
  });
});

interface KvHarness {
  readonly kv: KvPort;
  readonly keys: string[];
  readonly ttls: number[];
}

const createKv = (count: number): KvHarness => {
  const keys: string[] = [];
  const ttls: number[] = [];
  const kv: KvPort = {
    get: async (): Promise<string | null> => Promise.resolve(null),
    set: async (): Promise<void> => Promise.resolve(),
    delete: async (): Promise<void> => Promise.resolve(),
    getAndDelete: async (): Promise<string | null> => Promise.resolve(null),
    incrementWithTtl: async (key: string, ttlSeconds: number): Promise<number> => {
      keys.push(key);
      ttls.push(ttlSeconds);
      return Promise.resolve(count);
    },
  };
  return { kv, keys, ttls };
};

const OPTIONS = { bucket: "auth", limit: 2, windowSeconds: 60 } as const;

describe("checkRateLimit", () => {
  it("enforces the limit on a memory KV, so no deployment is unlimited", async () => {
    // Previously "is a no-op when no KV is configured". The KV is now always
    // present, so there is no configuration in which this silently does nothing.
    const kv = createMemoryKv();
    const ctx = createCtx({ kv });
    await expect(checkRateLimit(ctx, "orders.list", OPTIONS)).resolves.toBeUndefined();
    await expect(checkRateLimit(ctx, "orders.list", OPTIONS)).resolves.toBeUndefined();
    await expect(checkRateLimit(ctx, "orders.list", OPTIONS)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("passes under the limit and keys by userId first", async () => {
    const harness = createKv(2);
    const ctx = createCtx({ session: SESSION, ip: "203.0.113.9", kv: harness.kv });
    await expect(checkRateLimit(ctx, "orders.list", OPTIONS)).resolves.toBeUndefined();
    expect(harness.keys).toEqual(["rl:auth:orders.list:user-1"]);
    expect(harness.ttls).toEqual([60]);
  });

  it("throws RATE_LIMITED above the limit", async () => {
    const harness = createKv(3);
    const ctx = createCtx({ session: SESSION, kv: harness.kv });
    await expect(checkRateLimit(ctx, "orders.list", OPTIONS)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      httpStatus: 429,
      message: "3/2 in 60s for rl:auth:orders.list:user-1",
      context: { requestId: "req-1" },
    });
  });

  it("falls back to the ip and then to anon for the key subject", async () => {
    const withIp = createKv(1);
    await checkRateLimit(createCtx({ ip: "203.0.113.9", kv: withIp.kv }), "p", OPTIONS);
    expect(withIp.keys).toEqual(["rl:auth:p:203.0.113.9"]);

    const anonymous = createKv(1);
    await checkRateLimit(createCtx({ kv: anonymous.kv }), "p", OPTIONS);
    expect(anonymous.keys).toEqual(["rl:auth:p:anon"]);
  });
});
