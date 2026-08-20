/**
 * AnalyticsPort + typed event catalog — shared by backend and frontend so an
 * event name always carries the same props shape everywhere.
 *
 * Deliberately ZOD-FREE: runtime validation lives in ./analytics-validation.js
 * (subpath ./observability/validation) so the ~59 kB zod cost is opt-in and the
 * common full-entry size budget holds.
 */

export interface OrderCreatedProps {
  readonly orderId: string;
  readonly branchId: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly lineCount: number;
}
export interface OrderStatusChangedProps {
  readonly orderId: string;
  readonly branchId: string;
  readonly from: string;
  readonly to: string;
}
export interface AuthSignedInProps {
  readonly method: "password" | "magic-link";
  readonly role: string;
}
export interface TableAssignedProps {
  readonly tableId: string;
  readonly branchId: string;
  readonly waiterId: string;
}

/** Event name -> props type. The ONLY place a new event is declared. */
export interface AnalyticsEventMap {
  readonly "order.created": OrderCreatedProps;
  readonly "order.status_changed": OrderStatusChangedProps;
  readonly "auth.signed_in": AuthSignedInProps;
  readonly "table.assigned": TableAssignedProps;
}
export type AnalyticsEventName = keyof AnalyticsEventMap;
export type AnalyticsEventProps<E extends AnalyticsEventName> = AnalyticsEventMap[E];

/** PII allowlist for identify(). Anything not listed here never leaves the app. */
export interface AnalyticsTraits {
  // `| undefined` keeps zod .optional() assignable under exactOptionalPropertyTypes.
  readonly role?: string | undefined;
  readonly branchId?: string | undefined;
  readonly locale?: string | undefined;
}

export interface AnalyticsContext {
  readonly requestId?: string;
  readonly branchId?: string;
  /** 0..1 — dispatcher drops the event when rng() >= sampleRate. */
  readonly sampleRate?: number;
}

export interface AnalyticsPort {
  readonly track: <E extends AnalyticsEventName>(
    event: E,
    props: AnalyticsEventProps<E>,
    context?: AnalyticsContext,
  ) => void;
  readonly identify: (userId: string, traits: AnalyticsTraits) => void;
  readonly flush: () => Promise<void>;
}

export const noopAnalytics: AnalyticsPort = {
  track: (): void => {
    /* intentional no-op */
  },
  identify: (): void => {
    /* intentional no-op */
  },
  flush: async (): Promise<void> => Promise.resolve(),
};
