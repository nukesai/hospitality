import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpLogger, type HttpLoggerConfig } from "./http-logger.js";

const config = (overrides: Partial<HttpLoggerConfig> = {}): HttpLoggerConfig => ({
  endpoint: "/api/client-logs",
  minLevel: "info",
  maxBuffer: 3,
  flushIntervalMs: 5_000,
  clock: () => new Date("2026-08-20T00:00:00.000Z"),
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createHttpLogger", () => {
  it("buffers above minLevel and flushes as one JSON batch", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null));
    const logger = createHttpLogger(config({ fetchFn }), { requestId: "r1" });
    logger.debug("dropped — below minLevel");
    logger.info("kept", { a: 1 });
    logger.error("kept too");
    await logger.flush();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string) as {
      level: string;
      msg: string;
      fields: Record<string, unknown>;
    }[];
    expect(body.map((l) => l.level)).toEqual(["info", "error"]);
    expect(body[0]?.fields).toEqual({ requestId: "r1", a: 1 });
    expect((fetchFn.mock.calls[0]?.[1] as RequestInit & { keepalive: boolean }).keepalive).toBe(
      true,
    );
    logger.dispose();
  });

  it("drops oldest lines beyond maxBuffer (bounded — no leak)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null));
    const logger = createHttpLogger(config({ fetchFn }));
    for (let i = 0; i < 6; i += 1) logger.info(`m${String(i)}`);
    await logger.flush();
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string) as {
      msg: string;
    }[];
    expect(body.map((l) => l.msg)).toEqual(["m3", "m4", "m5"]);
    logger.dispose();
  });

  it("flushes on the interval and never throws on fetch failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    const logger = createHttpLogger(config({ fetchFn }));
    logger.warn("buffered");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // batch was dropped; a second interval with empty buffer does not fetch
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    logger.dispose();
  });

  it("child loggers merge bindings, share ONE buffer+timer, and dispose cascades", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null));
    const parent = createHttpLogger(config({ fetchFn }), { app: "pos" });
    const child = parent.child({ requestId: "r9" }) as ReturnType<typeof createHttpLogger>;
    child.fatal("boom");
    await child.flush();
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string) as {
      fields: Record<string, unknown>;
    }[];
    expect(body[0]?.fields).toEqual({ app: "pos", requestId: "r9" });
    // children share the parent's sink — one dispose stops the single timer
    child.dispose();
    child.trace("below level — ignored");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("defaults fetch and clock when not injected (jsdom globals)", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
    const logger = createHttpLogger({
      endpoint: "/x",
      minLevel: "trace",
      maxBuffer: 10,
      flushIntervalMs: 60_000,
    });
    logger.trace("uses default clock");
    logger.dispose();
    vi.unstubAllGlobals();
  });
});
