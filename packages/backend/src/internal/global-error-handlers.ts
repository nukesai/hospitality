/**
 * Registered ONCE from backend bootstrap (Next: instrumentation.ts; Docker: server entry).
 * Idempotent; returns a disposer so tests can unregister (0-memory-leak rule:
 * every listener has a lifecycle).
 */
import type { LoggerPort } from "@nukesai-pos/common";

export interface GlobalErrorHandlerOptions {
  readonly logger: LoggerPort;
  /**
   * "server" (Docker/long-lived): log fatal, flush, then exit(1) — state is
   *   unknowable after an uncaughtException; the orchestrator restarts us.
   * "vercel" (serverless): log + flush ONLY. Never process.exit(): the runtime
   *   owns the process lifecycle and reuses it across invocations.
   */
  readonly runtime: "server" | "vercel";
  /** Test seam for process.exit. */
  readonly exit?: (code: number) => void;
}

let registered = false;

export const registerGlobalErrorHandlers = (options: GlobalErrorHandlerOptions): (() => void) => {
  if (registered) {
    return () => {
      /* already owned elsewhere */
    };
  }
  registered = true;

  const { logger } = options;
  const exit = options.exit ?? ((code: number): void => process.exit(code));

  const onUnhandledRejection = (reason: unknown): void => {
    logger.error("process.unhandledRejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    // A rejection is not proven-corrupt state: log loudly, keep serving.
  };

  const onUncaughtException = (error: Error): void => {
    logger.fatal("process.uncaughtException", { message: error.message, stack: error.stack });
    void logger.flush().finally(() => {
      if (options.runtime === "server") exit(1);
    });
  };

  process.on("unhandledRejection", onUnhandledRejection);
  process.on("uncaughtException", onUncaughtException);

  return (): void => {
    process.off("unhandledRejection", onUnhandledRejection);
    process.off("uncaughtException", onUncaughtException);
    registered = false;
  };
};
