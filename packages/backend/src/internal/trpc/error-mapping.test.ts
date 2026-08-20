import { AppError, type LoggerPort } from "@nukesai-pos/common";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { appErrorToTRPCError, toSafeErrorData } from "./error-mapping.js";

interface LoggerHarness {
  readonly logger: LoggerPort;
  readonly fatal: ReturnType<typeof vi.fn<LoggerPort["fatal"]>>;
  readonly error: ReturnType<typeof vi.fn<LoggerPort["error"]>>;
  readonly warn: ReturnType<typeof vi.fn<LoggerPort["warn"]>>;
}

const createLogger = (): LoggerHarness => {
  const fatal = vi.fn<LoggerPort["fatal"]>();
  const error = vi.fn<LoggerPort["error"]>();
  const warn = vi.fn<LoggerPort["warn"]>();
  const logger: LoggerPort = {
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn,
    error,
    fatal,
    child: (): LoggerPort => logger,
    flush: async (): Promise<void> => Promise.resolve(),
  };
  return { logger, fatal, error, warn };
};

describe("appErrorToTRPCError", () => {
  it("maps the registry code, safe message key and cause", () => {
    const appError = new AppError("RATE_LIMITED");
    const trpcError = appErrorToTRPCError(appError);
    expect(trpcError).toBeInstanceOf(TRPCError);
    expect(trpcError.code).toBe("TOO_MANY_REQUESTS");
    expect(trpcError.message).toBe("errors.rateLimited");
    expect(trpcError.cause).toBe(appError);
  });
});

describe("toSafeErrorData", () => {
  it("maps a ZodError cause to the 422 validation contract with field issues", () => {
    const parsed = z.object({ name: z.string(), qty: z.number() }).safeParse({});
    if (parsed.success) throw new Error("expected a zod failure");
    const trpcError = new TRPCError({ code: "BAD_REQUEST", cause: parsed.error });
    const harness = createLogger();
    const data = toSafeErrorData(trpcError, "req-1", harness.logger);
    expect(data).toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "errors.validationFailed",
      httpStatus: 422,
      requestId: "req-1",
    });
    expect(data.issues?.map((issue) => issue.path)).toEqual(["name", "qty"]);
    for (const issue of data.issues ?? []) {
      expect(typeof issue.message).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
    }
    expect(harness.fatal).not.toHaveBeenCalled();
    expect(harness.error).not.toHaveBeenCalled();
    expect(harness.warn).not.toHaveBeenCalled();
  });

  it("routes a fatal AppError cause to logger.fatal", () => {
    const appError = new AppError("DATABASE_UNAVAILABLE", { internalMessage: "pg down" });
    const trpcError = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: appError.safeMessageKey,
      cause: appError,
    });
    const harness = createLogger();
    const data = toSafeErrorData(trpcError, "req-2", harness.logger);
    expect(data).toEqual({
      code: "DATABASE_UNAVAILABLE",
      messageKey: "errors.internal",
      httpStatus: 500,
      requestId: "req-2",
      issues: undefined,
    });
    expect(harness.fatal).toHaveBeenCalledExactlyOnceWith(
      "request.error",
      expect.objectContaining({
        errorCode: "DATABASE_UNAVAILABLE",
        severity: "fatal",
        internalMessage: "pg down",
        requestId: "req-2",
      }),
    );
    expect(harness.error).not.toHaveBeenCalled();
    expect(harness.warn).not.toHaveBeenCalled();
  });

  it("routes an error-severity AppError cause to logger.error", () => {
    const trpcError = new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      cause: new AppError("CACHE_UNAVAILABLE"),
    });
    const harness = createLogger();
    const data = toSafeErrorData(trpcError, "req-3", harness.logger);
    expect(data.code).toBe("CACHE_UNAVAILABLE");
    expect(harness.error).toHaveBeenCalledExactlyOnceWith(
      "request.error",
      expect.objectContaining({ severity: "error" }),
    );
    expect(harness.fatal).not.toHaveBeenCalled();
    expect(harness.warn).not.toHaveBeenCalled();
  });

  it("routes lower severities to logger.warn", () => {
    const trpcError = new TRPCError({
      code: "TOO_MANY_REQUESTS",
      cause: new AppError("RATE_LIMITED"),
    });
    const harness = createLogger();
    const data = toSafeErrorData(trpcError, undefined, harness.logger);
    expect(data).toEqual({
      code: "RATE_LIMITED",
      messageKey: "errors.rateLimited",
      httpStatus: 429,
      requestId: undefined,
      issues: undefined,
    });
    expect(harness.warn).toHaveBeenCalledExactlyOnceWith(
      "request.error",
      expect.objectContaining({ severity: "warn", requestId: undefined }),
    );
  });

  it("wraps a non-AppError cause into INTERNAL", () => {
    const trpcError = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: new Error("boom") });
    const harness = createLogger();
    const data = toSafeErrorData(trpcError, "req-4", harness.logger);
    expect(data).toEqual({
      code: "INTERNAL",
      messageKey: "errors.internal",
      httpStatus: 500,
      requestId: "req-4",
      issues: undefined,
    });
    expect(harness.error).toHaveBeenCalledExactlyOnceWith(
      "request.error",
      expect.objectContaining({ internalMessage: "boom" }),
    );
  });

  it("uses the TRPCError itself when there is no cause", () => {
    const trpcError = new TRPCError({ code: "NOT_FOUND", message: "nothing here" });
    const harness = createLogger();
    const data = toSafeErrorData(trpcError, "req-5", harness.logger);
    expect(data.code).toBe("INTERNAL");
    expect(harness.error).toHaveBeenCalledExactlyOnceWith(
      "request.error",
      expect.objectContaining({ internalMessage: "nothing here" }),
    );
  });
});
