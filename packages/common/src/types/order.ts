/**
 * Branded identifier for a physical location (branch). The POS data model is a
 * flat database with per-location isolation — every port method takes a
 * LocationId as its first parameter. Explicitly NOT multi-tenant SaaS.
 */
export type LocationId = string & { readonly __brand: "LocationId" };

/** ISO 4217 currency code, e.g. "EUR", "USD", "NPR". */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

/** A single line on an order. Amounts are integer minor units (cents/paisa). */
export interface OrderLine {
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  /** Unit price in minor units, tax-inclusive. */
  readonly unitPriceMinor: number;
}

export const ORDER_STATUSES = ["pending", "preparing", "ready", "delivered", "paid"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  readonly id: string;
  readonly locationId: LocationId;
  readonly status: OrderStatus;
  readonly lines: readonly OrderLine[];
  readonly currency: CurrencyCode;
  /** Epoch milliseconds. */
  readonly createdAt: number;
}
