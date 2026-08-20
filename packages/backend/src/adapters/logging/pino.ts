/**
 * Server-only pino 10 adapter for LoggerPort. NO pino.transport (worker threads
 * — broken/wasteful on Vercel serverless); plain JSON to stdout, which Vercel
 * log drains ingest natively. Destination is injectable for tests.
 */
import pino from "pino"; // `export =` types: default import + esModuleInterop, NOT `import { pino }` (loses .destination)
import type { DestinationStream, Logger as PinoLogger } from "pino";

import type { LogBindings, LogFields, LoggerPort, LogLevel } from "@nukesai-pos/common";

export interface PinoLoggerConfig {
  readonly level: LogLevel;
  /** "vercel" => synchronous stdout writes (function may freeze after response). */
  readonly runtime: "server" | "vercel";
  /** Dot-paths redacted from every line, e.g. ["*.password", "user.email"]. */
  readonly redactPaths: readonly string[];
  /** Stamped on every line: { service: "backend", env: "production" }. */
  readonly base: LogBindings;
  /** Test seam. Defaults to (sync-aware) stdout. */
  readonly destination?: DestinationStream;
}

const wrap = (instance: PinoLogger): LoggerPort => ({
  trace: (message: string, fields?: LogFields): void => {
    instance.trace(fields ?? {}, message);
  },
  debug: (message: string, fields?: LogFields): void => {
    instance.debug(fields ?? {}, message);
  },
  info: (message: string, fields?: LogFields): void => {
    instance.info(fields ?? {}, message);
  },
  warn: (message: string, fields?: LogFields): void => {
    instance.warn(fields ?? {}, message);
  },
  error: (message: string, fields?: LogFields): void => {
    instance.error(fields ?? {}, message);
  },
  fatal: (message: string, fields?: LogFields): void => {
    instance.fatal(fields ?? {}, message);
  },
  child: (bindings: LogBindings): LoggerPort => wrap(instance.child(bindings)),
  flush: async (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      instance.flush((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    }),
});

export const createPinoLogger = (config: PinoLoggerConfig): LoggerPort => {
  const destination: DestinationStream =
    config.destination
    // sync:true on serverless: sonic-boom buffers async by default; a frozen
    // Vercel invocation would otherwise drop the tail of the buffer.
    ?? pino.destination({ sync: config.runtime === "vercel" });

  const instance = pino(
    {
      level: config.level,
      base: { ...config.base },
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: "msg",
      formatters: {
        // Vercel log drains + most collectors expect the label, not pino's int.
        level: (label: string): { level: string } => ({ level: label }),
      },
      redact: { paths: [...config.redactPaths], censor: "[redacted]" },
    },
    destination,
  );

  return wrap(instance);
};
