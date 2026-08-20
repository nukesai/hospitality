import {
  ERROR_CODES,
  type AppErrorCode,
  type ErrorDescriptor,
  type ErrorSeverity,
  type TrpcErrorCode,
} from "./codes.js";

/** Correlation fields attached to an error for logging — never sent to clients. */
export interface ErrorContext {
  readonly requestId?: string;
  readonly branchId?: string;
  readonly userId?: string;
  readonly [key: string]: string | number | boolean | undefined;
}

export interface AppErrorOptions {
  /** Operator-facing detail for logs. Defaults to the safe message key. */
  readonly internalMessage?: string;
  /** Overrides the registry's client-visible i18n key. Must stay generic. */
  readonly safeMessageKey?: string;
  readonly cause?: unknown;
  readonly context?: ErrorContext;
}

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly httpStatus: number;
  public readonly trpcCode: TrpcErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly safeMessageKey: string;
  public readonly context: ErrorContext;

  public constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    const descriptor: ErrorDescriptor = ERROR_CODES[code];
    // ES2022 ErrorOptions: preserves the full cause chain for logging.
    super(options.internalMessage ?? descriptor.safeMessageKey, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.httpStatus = descriptor.httpStatus;
    this.trpcCode = descriptor.trpcCode;
    this.severity = descriptor.severity;
    this.safeMessageKey = options.safeMessageKey ?? descriptor.safeMessageKey;
    this.context = options.context ?? {};
  }

  /** The ONLY shape allowed to cross the wire. No stack, no cause, no internals. */
  public toSafeBody(): {
    readonly code: AppErrorCode;
    readonly messageKey: string;
    readonly requestId: string | undefined;
  } {
    return { code: this.code, messageKey: this.safeMessageKey, requestId: this.context.requestId };
  }

  /** Structured fields for LoggerPort — includes internals, stays server-side. */
  public toLogFields(): Readonly<Record<string, unknown>> {
    return {
      errorCode: this.code,
      severity: this.severity,
      httpStatus: this.httpStatus,
      internalMessage: this.message,
      ...this.context,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;

/** Wrap unknown throw sites exactly once; keeps `cause` chaining intact. */
export const toAppError = (value: unknown, fallback: AppErrorCode = "INTERNAL"): AppError =>
  isAppError(value)
    ? value
    : new AppError(fallback, {
        internalMessage: value instanceof Error ? value.message : String(value),
        cause: value,
      });
