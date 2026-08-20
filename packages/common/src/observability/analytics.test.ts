import { describe, expect, it, vi } from "vitest";

import { noopAnalytics, type AnalyticsEventName, type AnalyticsPort } from "./analytics.js";
import { ANALYTICS_EVENTS, createValidatedAnalytics } from "./analytics-validation.js";

const makeSink = (): AnalyticsPort & {
  readonly tracked: unknown[][];
  readonly identified: unknown[][];
} => {
  const tracked: unknown[][] = [];
  const identified: unknown[][] = [];
  return {
    tracked,
    identified,
    track: (...args: unknown[]) => {
      tracked.push(args);
    },
    identify: (...args: unknown[]) => {
      identified.push(args);
    },
    flush: async () => Promise.resolve(),
  };
};

const validOrderCreated = {
  orderId: "o1",
  branchId: "b1",
  totalMinor: 1250,
  currency: "EUR",
  lineCount: 2,
};

describe("ANALYTICS_EVENTS", () => {
  it("every declared event has a validator", () => {
    const names: AnalyticsEventName[] = [
      "order.created",
      "order.status_changed",
      "auth.signed_in",
      "table.assigned",
    ];
    for (const name of names) {
      expect(ANALYTICS_EVENTS[name]).toBeDefined();
    }
  });
});

describe("createValidatedAnalytics", () => {
  it("dispatches valid events to the sink", () => {
    const sink = makeSink();
    const analytics = createValidatedAnalytics(sink, vi.fn());
    analytics.track("order.created", validOrderCreated);
    expect(sink.tracked).toHaveLength(1);
  });

  it("drops invalid events and reports the name — never throws", () => {
    const sink = makeSink();
    const onInvalid = vi.fn();
    const analytics = createValidatedAnalytics(sink, onInvalid);
    analytics.track("order.created", { ...validOrderCreated, totalMinor: -5 });
    expect(sink.tracked).toHaveLength(0);
    expect(onInvalid).toHaveBeenCalledExactlyOnceWith("order.created");
  });

  it("samples deterministically via the injected rng", () => {
    const sink = makeSink();
    const analytics = createValidatedAnalytics(sink, vi.fn(), () => 0.9);
    analytics.track("order.created", validOrderCreated, { sampleRate: 0.5 });
    expect(sink.tracked).toHaveLength(0);
    analytics.track("order.created", validOrderCreated, { sampleRate: 0.95 });
    expect(sink.tracked).toHaveLength(1);
  });

  it("identify enforces the strict traits allowlist", () => {
    const sink = makeSink();
    const analytics = createValidatedAnalytics(sink, vi.fn());
    analytics.identify("u1", { role: "waiter", branchId: "b1" });
    expect(sink.identified).toHaveLength(1);
    // Unknown keys are rejected by .strict() — silently dropped.
    analytics.identify("u1", { email: "leak@example.com" } as never);
    expect(sink.identified).toHaveLength(1);
  });

  it("flush delegates to the sink and noopAnalytics is inert", async () => {
    const sink = makeSink();
    const analytics = createValidatedAnalytics(sink, vi.fn());
    await expect(analytics.flush()).resolves.toBeUndefined();
    expect(() => {
      noopAnalytics.track("auth.signed_in", { method: "password", role: "owner" });
      noopAnalytics.identify("u1", {});
    }).not.toThrow();
    await expect(noopAnalytics.flush()).resolves.toBeUndefined();
  });
});
