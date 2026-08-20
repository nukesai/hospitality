"use client";

/**
 * Browser LoggerPort adapter: buffers lines and POSTs them to a backend ingest
 * endpoint (which re-applies pino redaction server-side). ZERO console usage.
 * dispose() clears the timer — every subscription has a lifecycle.
 */
import type { LogBindings, LogFields, LoggerPort, LogLevel } from "@nukesai-pos/common";

export interface HttpLoggerConfig {
  readonly endpoint: string; // consumer-configured, e.g. /api/client-logs
  readonly minLevel: LogLevel;
  readonly maxBuffer: number; // oldest lines dropped beyond this — bounded by construction
  readonly flushIntervalMs: number;
  readonly fetchFn?: typeof fetch; // test seam
  readonly clock?: () => Date; // test seam
}

interface Line {
  readonly level: LogLevel;
  readonly msg: string;
  readonly time: string;
  readonly fields: LogFields;
}

const ORDER: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export type HttpLogger = LoggerPort & { readonly dispose: () => void };

interface SharedSink {
  readonly push: (line: Line) => void;
  readonly send: () => Promise<void>;
  readonly dispose: () => void;
}

const makeLogger = (
  sink: SharedSink,
  bindings: LogBindings,
  clock: () => Date,
  min: number,
): HttpLogger => {
  const push =
    (level: LogLevel) =>
    (msg: string, fields?: LogFields): void => {
      if (ORDER.indexOf(level) < min) return;
      sink.push({ level, msg, time: clock().toISOString(), fields: { ...bindings, ...fields } });
    };
  return {
    trace: push("trace"),
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    fatal: push("fatal"),
    // Children are lightweight views over the SAME buffer and timer — a child
    // per request must never start its own interval (timer-leak, review-caught).
    child: (extra: LogBindings): HttpLogger =>
      makeLogger(sink, { ...bindings, ...extra }, clock, min),
    flush: async (): Promise<void> => sink.send(),
    dispose: (): void => {
      sink.dispose();
    },
  };
};

export const createHttpLogger = (
  config: HttpLoggerConfig,
  bindings: LogBindings = {},
): HttpLogger => {
  const buffer: Line[] = [];
  const fetchFn = config.fetchFn ?? fetch;
  const clock = config.clock ?? ((): Date => new Date());
  const min = ORDER.indexOf(config.minLevel);

  const send = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      await fetchFn(config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
        keepalive: true, // survives page unload
      });
    } catch {
      /* telemetry must never break the app; batch is dropped */
    }
  };

  const timer = setInterval(() => {
    void send();
  }, config.flushIntervalMs);

  const sink: SharedSink = {
    push: (line: Line): void => {
      buffer.push(line);
      if (buffer.length > config.maxBuffer) buffer.shift();
    },
    send,
    dispose: (): void => {
      clearInterval(timer);
    },
  };

  return makeLogger(sink, bindings, clock, min);
};
