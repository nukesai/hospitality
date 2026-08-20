/**
 * Zod-backed runtime validation for the analytics event catalog. OPT-IN subpath
 * (@nukesai-pos/common/observability/validation): importing it pays for zod;
 * the port/interfaces in ./analytics.js stay dependency-free.
 *
 * isolatedDeclarations rule: schemas are annotated `z.ZodType<Props>` —
 * `z.infer` + `as const` maps do NOT compile (verified: TS9013).
 */
import { z } from "zod";

import type {
  AnalyticsContext,
  AnalyticsEventMap,
  AnalyticsEventName,
  AnalyticsEventProps,
  AnalyticsPort,
  AnalyticsTraits,
} from "./analytics.js";

type EventSchemas = { readonly [E in AnalyticsEventName]: z.ZodType<AnalyticsEventMap[E]> };

/** Runtime validators — structurally locked to AnalyticsEventMap. */
export const ANALYTICS_EVENTS: EventSchemas = {
  "order.created": z.object({
    orderId: z.string(),
    branchId: z.string(),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    lineCount: z.number().int().positive(),
  }),
  "order.status_changed": z.object({
    orderId: z.string(),
    branchId: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  "auth.signed_in": z.object({
    method: z.enum(["password", "magic-link"]),
    role: z.string(),
  }),
  "table.assigned": z.object({
    tableId: z.string(),
    branchId: z.string(),
    waiterId: z.string(),
  }),
};

export const ANALYTICS_TRAITS_SCHEMA: z.ZodType<AnalyticsTraits> = z
  .object({
    role: z.string().optional(),
    branchId: z.string().optional(),
    locale: z.string().optional(),
  })
  .strict();

/**
 * Validate-then-dispatch decorator: invalid or sampled-out events are dropped
 * (and logged by the caller), never thrown — telemetry must not fail requests.
 * `rng` injectable so sampling is deterministic under test (100% coverage rule).
 */
export const createValidatedAnalytics = (
  sink: AnalyticsPort,
  onInvalid: (event: AnalyticsEventName) => void,
  rng: () => number = Math.random,
): AnalyticsPort => ({
  track: <E extends AnalyticsEventName>(
    event: E,
    props: AnalyticsEventProps<E>,
    context?: AnalyticsContext,
  ): void => {
    if (context?.sampleRate !== undefined && rng() >= context.sampleRate) return;
    const result = ANALYTICS_EVENTS[event].safeParse(props);
    if (!result.success) {
      onInvalid(event);
      return;
    }
    sink.track(event, result.data, context);
  },
  identify: (userId: string, traits: AnalyticsTraits): void => {
    const result = ANALYTICS_TRAITS_SCHEMA.safeParse(traits);
    if (result.success) sink.identify(userId, result.data);
  },
  flush: async (): Promise<void> => sink.flush(),
});
