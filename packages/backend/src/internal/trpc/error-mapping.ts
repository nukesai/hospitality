import { type AppError, toAppError, type LoggerPort } from "@nukesai-pos/common";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const appErrorToTRPCError = (error: AppError): TRPCError =>
  new TRPCError({
    code: error.trpcCode,
    // message is CLIENT-VISIBLE in tRPC responses: only the safe i18n key.
    message: error.safeMessageKey,
    cause: error,
  });

export interface SafeErrorData {
  readonly code: string;
  readonly messageKey: string;
  readonly httpStatus: number;
  readonly requestId: string | undefined;
  readonly issues: readonly { readonly path: string; readonly message: string }[] | undefined;
}

/**
 * tRPC wraps a failed input parse in TRPCError{code:"BAD_REQUEST", cause: ZodError}
 * (verified) — surfaced as the 422 VALIDATION_FAILED contract with field issues;
 * everything else collapses to the registry's safe shape. Internals are logged
 * (severity-routed) and never leave the process.
 */
export const toSafeErrorData = (
  error: TRPCError,
  requestId: string | undefined,
  logger: LoggerPort,
): SafeErrorData => {
  if (error.cause instanceof z.ZodError) {
    const flattened = z.flattenError(error.cause);
    return {
      code: "VALIDATION_FAILED",
      messageKey: "errors.validationFailed",
      httpStatus: 422,
      requestId,
      issues: Object.entries(flattened.fieldErrors as Record<string, readonly string[]>).flatMap(
        ([path, messages]) => messages.map((message) => ({ path, message })),
      ),
    };
  }
  const appError = toAppError(error.cause ?? error);
  const fields = { ...appError.toLogFields(), requestId };
  if (appError.severity === "fatal") logger.fatal("request.error", fields);
  else if (appError.severity === "error") logger.error("request.error", fields);
  else logger.warn("request.error", fields);
  return {
    code: appError.code,
    messageKey: appError.safeMessageKey,
    httpStatus: appError.httpStatus,
    requestId,
    issues: undefined,
  };
};
