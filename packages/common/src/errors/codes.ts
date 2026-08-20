/**
 * Error-code registry — the single typed source of truth in common.
 * `trpcCode` values are string literals matching @trpc/server's TRPC_ERROR_CODE_KEY
 * (common must NOT import @trpc/server); backend narrows them at the boundary.
 */

export type ErrorSeverity = "info" | "warn" | "error" | "fatal";

/** Subset of tRPC v11 TRPC_ERROR_CODE_KEY we map onto (verified against 11.18.0). */
export type TrpcErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "UNPROCESSABLE_CONTENT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR";

export interface ErrorDescriptor {
  readonly httpStatus: number;
  readonly trpcCode: TrpcErrorCode;
  readonly severity: ErrorSeverity;
  /** Client-visible default; NEVER include internals. i18n key, not prose. */
  readonly safeMessageKey: string;
}

/** Explicit registry interface — required by isolatedDeclarations (TS9010 otherwise). */
export interface ErrorRegistry {
  readonly VALIDATION_FAILED: ErrorDescriptor;
  readonly UNAUTHENTICATED: ErrorDescriptor;
  readonly BRANCH_ACCESS_DENIED: ErrorDescriptor;
  readonly ROLE_FORBIDDEN: ErrorDescriptor;
  readonly RESOURCE_NOT_FOUND: ErrorDescriptor;
  readonly ORDER_STATE_CONFLICT: ErrorDescriptor;
  readonly RATE_LIMITED: ErrorDescriptor;
  readonly DATABASE_UNAVAILABLE: ErrorDescriptor;
  readonly CACHE_UNAVAILABLE: ErrorDescriptor;
  readonly INTERNAL: ErrorDescriptor;
}

export const ERROR_CODES: ErrorRegistry = {
  VALIDATION_FAILED: {
    httpStatus: 422,
    trpcCode: "UNPROCESSABLE_CONTENT",
    severity: "info",
    safeMessageKey: "errors.validationFailed",
  },
  UNAUTHENTICATED: {
    httpStatus: 401,
    trpcCode: "UNAUTHORIZED",
    severity: "info",
    safeMessageKey: "errors.unauthenticated",
  },
  BRANCH_ACCESS_DENIED: {
    httpStatus: 403,
    trpcCode: "FORBIDDEN",
    severity: "warn",
    safeMessageKey: "errors.branchAccessDenied",
  },
  ROLE_FORBIDDEN: {
    httpStatus: 403,
    trpcCode: "FORBIDDEN",
    severity: "warn",
    safeMessageKey: "errors.roleForbidden",
  },
  RESOURCE_NOT_FOUND: {
    httpStatus: 404,
    trpcCode: "NOT_FOUND",
    severity: "info",
    safeMessageKey: "errors.resourceNotFound",
  },
  ORDER_STATE_CONFLICT: {
    httpStatus: 409,
    trpcCode: "CONFLICT",
    severity: "warn",
    safeMessageKey: "errors.orderStateConflict",
  },
  RATE_LIMITED: {
    httpStatus: 429,
    trpcCode: "TOO_MANY_REQUESTS",
    severity: "warn",
    safeMessageKey: "errors.rateLimited",
  },
  DATABASE_UNAVAILABLE: {
    httpStatus: 500,
    trpcCode: "INTERNAL_SERVER_ERROR",
    severity: "fatal",
    safeMessageKey: "errors.internal",
  },
  CACHE_UNAVAILABLE: {
    httpStatus: 500,
    trpcCode: "INTERNAL_SERVER_ERROR",
    severity: "error",
    safeMessageKey: "errors.internal",
  },
  INTERNAL: {
    httpStatus: 500,
    trpcCode: "INTERNAL_SERVER_ERROR",
    severity: "error",
    safeMessageKey: "errors.internal",
  },
};

export type AppErrorCode = keyof ErrorRegistry;

export const isAppErrorCode = (value: string): value is AppErrorCode =>
  Object.hasOwn(ERROR_CODES, value);
