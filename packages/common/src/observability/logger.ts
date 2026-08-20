/**
 * LoggerPort — isomorphic structured-logging contract.
 * Lives in @nukesai-pos/common: NO node builtins, NO console, NO process.env.
 * Adapters: pino (backend), buffered-fetch (frontend client), noop (default/tests).
 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Structured fields attached to a single log line. JSON-serializable only. */
export type LogFields = Readonly<Record<string, unknown>>;

/** Bindings copied onto every line a child logger emits (requestId, branchId, ...). */
export type LogBindings = Readonly<Record<string, string | number | boolean>>;

export interface LoggerPort {
  readonly trace: (message: string, fields?: LogFields) => void;
  readonly debug: (message: string, fields?: LogFields) => void;
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
  readonly fatal: (message: string, fields?: LogFields) => void;
  /** New logger that stamps `bindings` on every subsequent line. Cheap; no I/O. */
  readonly child: (bindings: LogBindings) => LoggerPort;
  /** Resolve when buffered lines are durably written (serverless: call before returning). */
  readonly flush: () => Promise<void>;
}

const noop = (): void => {
  /* intentional no-op */
};

const noopFlush = async (): Promise<void> => Promise.resolve();

/** Safe default so every service can log unconditionally; wiring injects a real one. */
export const noopLogger: LoggerPort = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: (): LoggerPort => noopLogger,
  flush: noopFlush,
};
