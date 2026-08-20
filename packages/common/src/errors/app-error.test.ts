import { describe, expect, it } from "vitest";

import { AppError, isAppError, toAppError } from "./app-error.js";
import { ERROR_CODES, isAppErrorCode, type ErrorDescriptor } from "./codes.js";

describe("ERROR_CODES registry", () => {
  it("maps every code to a coherent descriptor", () => {
    for (const [code, descriptor] of Object.entries(ERROR_CODES) as [string, ErrorDescriptor][]) {
      expect(isAppErrorCode(code)).toBe(true);
      expect(descriptor.httpStatus).toBeGreaterThanOrEqual(400);
      expect(descriptor.httpStatus).toBeLessThan(600);
      expect(descriptor.safeMessageKey.startsWith("errors.")).toBe(true);
    }
    expect(isAppErrorCode("NOT_A_CODE")).toBe(false);
  });
});

describe("AppError", () => {
  it("derives status/code/severity from the registry", () => {
    const error = new AppError("BRANCH_ACCESS_DENIED");
    expect(error.httpStatus).toBe(403);
    expect(error.trpcCode).toBe("FORBIDDEN");
    expect(error.severity).toBe("warn");
    expect(error.name).toBe("AppError");
    expect(error.message).toBe("errors.branchAccessDenied");
  });

  it("keeps internal message and cause out of the wire shape", () => {
    const cause = new Error("pg: connection refused");
    const error = new AppError("DATABASE_UNAVAILABLE", {
      internalMessage: "pool exhausted on branch xyz",
      cause,
      context: { requestId: "req-1", branchId: "b-1" },
    });
    expect(error.toSafeBody()).toEqual({
      code: "DATABASE_UNAVAILABLE",
      messageKey: "errors.internal",
      requestId: "req-1",
    });
    const log = error.toLogFields();
    expect(log.internalMessage).toBe("pool exhausted on branch xyz");
    expect(log.cause).toBe("pg: connection refused");
    expect(log.branchId).toBe("b-1");
  });

  it("supports safeMessageKey override and non-Error causes", () => {
    const error = new AppError("VALIDATION_FAILED", {
      safeMessageKey: "errors.custom",
      cause: "raw-string",
    });
    expect(error.toSafeBody().messageKey).toBe("errors.custom");
    expect(error.toLogFields().cause).toBe("raw-string");
  });
});

describe("toAppError", () => {
  it("passes AppError through untouched", () => {
    const original = new AppError("RATE_LIMITED");
    expect(toAppError(original)).toBe(original);
    expect(isAppError(original)).toBe(true);
  });

  it("wraps Error and non-Error values with cause preserved", () => {
    const wrapped = toAppError(new Error("boom"));
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).toBe("boom");

    const wrappedRaw = toAppError(42, "CACHE_UNAVAILABLE");
    expect(wrappedRaw.code).toBe("CACHE_UNAVAILABLE");
    expect(wrappedRaw.message).toBe("42");
    expect(isAppError("nope")).toBe(false);
  });
});
