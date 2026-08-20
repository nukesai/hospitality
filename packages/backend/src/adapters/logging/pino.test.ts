import type { DestinationStream } from "pino";
import { describe, expect, it } from "vitest";

import type { LoggerPort } from "@nukesai-pos/common";

import { createPinoLogger, type PinoLoggerConfig } from "./pino.js";

interface CapturedLine {
  readonly level: string;
  readonly msg: string;
  readonly time: string;
  readonly [key: string]: unknown;
}

interface Capture {
  readonly stream: DestinationStream;
  readonly lines: CapturedLine[];
}

const capture = (): Capture => {
  const lines: CapturedLine[] = [];
  return {
    stream: {
      write(msg: string): void {
        lines.push(JSON.parse(msg) as CapturedLine);
      },
    },
    lines,
  };
};

const makeLogger = (
  overrides: Partial<PinoLoggerConfig> = {},
): { logger: LoggerPort; lines: CapturedLine[] } => {
  const { stream, lines } = capture();
  const logger = createPinoLogger({
    level: "trace",
    runtime: "server",
    redactPaths: [],
    base: { service: "backend", env: "test" },
    destination: stream,
    ...overrides,
  });
  return { logger, lines };
};

describe("createPinoLogger", () => {
  it("writes JSON lines with msg, iso time, label level and base bindings", () => {
    const { logger, lines } = makeLogger();
    logger.info("hello", { orderId: "o-1" });
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.msg).toBe("hello");
    expect(line.level).toBe("info");
    expect(line.service).toBe("backend");
    expect(line.env).toBe("test");
    expect(line.orderId).toBe("o-1");
    expect(new Date(line.time).getTime()).not.toBeNaN();
  });

  it("formats the level as its label for all six methods", () => {
    const { logger, lines } = makeLogger();
    logger.trace("t", { i: 1 });
    logger.debug("d", { i: 2 });
    logger.info("i", { i: 3 });
    logger.warn("w", { i: 4 });
    logger.error("e", { i: 5 });
    logger.fatal("f", { i: 6 });
    expect(lines.map((l) => l.level)).toEqual(["trace", "debug", "info", "warn", "error", "fatal"]);
    expect(lines.map((l) => l.msg)).toEqual(["t", "d", "i", "w", "e", "f"]);
    expect(lines.map((l) => l.i)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("defaults fields to an empty object for all six methods", () => {
    const { logger, lines } = makeLogger();
    logger.trace("t");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");
    expect(lines.map((l) => l.msg)).toEqual(["t", "d", "i", "w", "e", "f"]);
  });

  it("drops lines below the configured level", () => {
    const { logger, lines } = makeLogger({ level: "warn" });
    logger.info("suppressed");
    logger.warn("kept");
    expect(lines.map((l) => l.msg)).toEqual(["kept"]);
  });

  it("merges child bindings onto every child line", () => {
    const { logger, lines } = makeLogger();
    const child = logger.child({ requestId: "r-1" });
    child.info("child line", { extra: true });
    const grandchild = child.child({ branchId: "b-1" });
    grandchild.error("deep line");
    expect(lines[0]).toMatchObject({
      msg: "child line",
      service: "backend",
      requestId: "r-1",
      extra: true,
    });
    expect(lines[1]).toMatchObject({
      msg: "deep line",
      requestId: "r-1",
      branchId: "b-1",
    });
  });

  it("censors redact paths with [redacted]", () => {
    const { logger, lines } = makeLogger({
      redactPaths: ["user.password", "*.token"],
    });
    logger.info("login", {
      user: { password: "hunter2", name: "bob" },
      session: { token: "abc" },
    });
    expect(lines[0]!.user).toEqual({ password: "[redacted]", name: "bob" });
    expect(lines[0]!.session).toEqual({ token: "[redacted]" });
  });

  it("flush resolves once pino reports the destination flushed", async () => {
    const flushed: boolean[] = [];
    const { logger } = makeLogger({
      destination: {
        write(): void {
          /* discard */
        },
        flush(cb?: (err?: Error) => void): void {
          flushed.push(true);
          cb?.();
        },
      } as DestinationStream,
    });
    await expect(logger.flush()).resolves.toBeUndefined();
    expect(flushed).toEqual([true]);
  });

  it("flush rejects when the destination reports an error", async () => {
    const { logger } = makeLogger({
      destination: {
        write(): void {
          /* discard */
        },
        flush(cb?: (err?: Error) => void): void {
          cb?.(new Error("disk gone"));
        },
      } as DestinationStream,
    });
    await expect(logger.flush()).rejects.toThrow("disk gone");
  });

  it("falls back to a stdout destination per runtime when none is injected", () => {
    // No lines are emitted (nothing is logged); this only exercises the
    // pino.destination sync/async selection for both runtimes.
    const server = createPinoLogger({
      level: "fatal",
      runtime: "server",
      redactPaths: [],
      base: {},
    });
    const vercel = createPinoLogger({
      level: "fatal",
      runtime: "vercel",
      redactPaths: [],
      base: {},
    });
    expect(typeof server.info).toBe("function");
    expect(typeof vercel.info).toBe("function");
  });
});
