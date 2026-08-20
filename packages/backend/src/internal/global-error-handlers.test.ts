import type { LoggerPort } from "@nukesai-pos/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerGlobalErrorHandlers } from "./global-error-handlers.js";
import type { GlobalErrorHandlerOptions } from "./global-error-handlers.js";

interface LoggerHarness {
  readonly logger: LoggerPort;
  readonly error: ReturnType<typeof vi.fn<LoggerPort["error"]>>;
  readonly fatal: ReturnType<typeof vi.fn<LoggerPort["fatal"]>>;
  readonly flush: ReturnType<typeof vi.fn<LoggerPort["flush"]>>;
}

const createLogger = (): LoggerHarness => {
  const error = vi.fn<LoggerPort["error"]>();
  const fatal = vi.fn<LoggerPort["fatal"]>();
  const flush = vi.fn<LoggerPort["flush"]>(async (): Promise<void> => Promise.resolve());
  const logger: LoggerPort = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error,
    fatal,
    child: (): LoggerPort => logger,
    flush,
  };
  return { logger, error, fatal, flush };
};

interface Registration {
  readonly dispose: () => void;
  readonly onRejection: NodeJS.UnhandledRejectionListener;
  readonly onException: NodeJS.UncaughtExceptionListener;
}

const disposers: (() => void)[] = [];

const register = (options: GlobalErrorHandlerOptions): Registration => {
  const rejectionBefore = process.listeners("unhandledRejection");
  const exceptionBefore = process.listeners("uncaughtException");
  const dispose = registerGlobalErrorHandlers(options);
  disposers.push(dispose);
  const onRejection = process
    .listeners("unhandledRejection")
    .find((listener) => !rejectionBefore.includes(listener));
  const onException = process
    .listeners("uncaughtException")
    .find((listener) => !exceptionBefore.includes(listener));
  if (onRejection === undefined || onException === undefined) {
    throw new Error("expected both listeners to be registered");
  }
  return { dispose, onRejection, onException };
};

const settleMacrotask = async (): Promise<void> =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
});

describe("registerGlobalErrorHandlers", () => {
  it("registers both listeners and the disposer removes them and re-arms registration", () => {
    const harness = createLogger();
    const rejectionCount = process.listenerCount("unhandledRejection");
    const exceptionCount = process.listenerCount("uncaughtException");
    const first = register({ logger: harness.logger, runtime: "vercel", exit: () => undefined });
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionCount + 1);
    expect(process.listenerCount("uncaughtException")).toBe(exceptionCount + 1);
    first.dispose();
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionCount);
    expect(process.listenerCount("uncaughtException")).toBe(exceptionCount);
    const second = register({ logger: harness.logger, runtime: "vercel", exit: () => undefined });
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionCount + 1);
    second.dispose();
  });

  it("returns a noop disposer for a second registration while one is active", () => {
    const harness = createLogger();
    register({ logger: harness.logger, runtime: "vercel", exit: () => undefined });
    const rejectionCount = process.listenerCount("unhandledRejection");
    const noopDispose = registerGlobalErrorHandlers({
      logger: harness.logger,
      runtime: "vercel",
      exit: () => undefined,
    });
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionCount);
    noopDispose();
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionCount);
  });

  it("logs an Error rejection reason with its stack and never exits", () => {
    const harness = createLogger();
    const exit = vi.fn<(code: number) => void>();
    const { onRejection } = register({ logger: harness.logger, runtime: "server", exit });
    const reason = new Error("boom");
    onRejection(reason, Promise.resolve());
    expect(harness.error).toHaveBeenCalledExactlyOnceWith("process.unhandledRejection", {
      reason: "boom",
      stack: reason.stack,
    });
    expect(exit).not.toHaveBeenCalled();
  });

  it("stringifies a non-Error rejection reason", () => {
    const harness = createLogger();
    const { onRejection } = register({
      logger: harness.logger,
      runtime: "server",
      exit: () => undefined,
    });
    onRejection(42, Promise.resolve());
    expect(harness.error).toHaveBeenCalledExactlyOnceWith("process.unhandledRejection", {
      reason: "42",
      stack: undefined,
    });
  });

  it("logs fatal, flushes, then exits(1) on the long-lived server runtime", async () => {
    const harness = createLogger();
    const exit = vi.fn<(code: number) => void>();
    const { onException } = register({ logger: harness.logger, runtime: "server", exit });
    const error = new Error("corrupted");
    onException(error, "uncaughtException");
    expect(harness.fatal).toHaveBeenCalledExactlyOnceWith("process.uncaughtException", {
      message: "corrupted",
      stack: error.stack,
    });
    expect(harness.flush).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    await settleMacrotask();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("never exits on the vercel runtime", async () => {
    const harness = createLogger();
    const exit = vi.fn<(code: number) => void>();
    const { onException } = register({ logger: harness.logger, runtime: "vercel", exit });
    onException(new Error("corrupted"), "uncaughtException");
    await settleMacrotask();
    expect(harness.fatal).toHaveBeenCalledOnce();
    expect(harness.flush).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it("defaults the exit seam to process.exit", async () => {
    const harness = createLogger();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { onException } = register({ logger: harness.logger, runtime: "server" });
    onException(new Error("corrupted"), "uncaughtException");
    await settleMacrotask();
    expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
  });
});
