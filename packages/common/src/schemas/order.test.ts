import { describe, expect, it } from "vitest";

import type { CurrencyCode, LocationId } from "../types/index.js";
import { isOrderStatus, validateOrder } from "./order.js";

const validLine = {
  productId: "p1",
  name: "Momo",
  quantity: 2,
  unitPriceMinor: 450,
};

const validOrder = {
  id: "order-1",
  locationId: "demo-main" as LocationId,
  status: "pending",
  lines: [validLine],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
};

describe("isOrderStatus", () => {
  it("accepts every known status", () => {
    for (const status of ["pending", "preparing", "ready", "delivered", "paid"]) {
      expect(isOrderStatus(status)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isOrderStatus("shipped")).toBe(false);
    expect(isOrderStatus(42)).toBe(false);
  });
});

describe("validateOrder", () => {
  it("accepts a valid order", () => {
    const result = validateOrder(validOrder);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("order-1");
  });

  it("rejects non-object input outright", () => {
    const result = validateOrder(null);
    expect(result).toEqual({
      ok: false,
      issues: [{ path: "", message: "Order must be an object." }],
    });
    expect(validateOrder("order").ok).toBe(false);
  });

  const failures: readonly [string, Record<string, unknown>][] = [
    ["non-string id", { ...validOrder, id: 7 }],
    ["empty id", { ...validOrder, id: "" }],
    ["non-string locationId", { ...validOrder, locationId: 7 }],
    ["empty locationId", { ...validOrder, locationId: "" }],
    ["unknown status", { ...validOrder, status: "shipped" }],
    ["non-string status", { ...validOrder, status: 3 }],
    ["non-array lines", { ...validOrder, lines: "none" }],
    ["non-object line", { ...validOrder, lines: [42] }],
    ["line with non-string productId", { ...validOrder, lines: [{ ...validLine, productId: 9 }] }],
    ["line with empty productId", { ...validOrder, lines: [{ ...validLine, productId: "" }] }],
    ["line with non-string name", { ...validOrder, lines: [{ ...validLine, name: 9 }] }],
    ["line with empty name", { ...validOrder, lines: [{ ...validLine, name: "" }] }],
    ["line with non-number quantity", { ...validOrder, lines: [{ ...validLine, quantity: "2" }] }],
    ["line with fractional quantity", { ...validOrder, lines: [{ ...validLine, quantity: 1.5 }] }],
    ["line with zero quantity", { ...validOrder, lines: [{ ...validLine, quantity: 0 }] }],
    [
      "line with non-number unitPriceMinor",
      { ...validOrder, lines: [{ ...validLine, unitPriceMinor: "450" }] },
    ],
    [
      "line with fractional unitPriceMinor",
      { ...validOrder, lines: [{ ...validLine, unitPriceMinor: 4.5 }] },
    ],
    ["non-string currency", { ...validOrder, currency: 3 }],
    ["wrong-length currency", { ...validOrder, currency: "EURO" }],
    ["non-number createdAt", { ...validOrder, createdAt: "now" }],
    ["non-finite createdAt", { ...validOrder, createdAt: Number.NaN }],
  ];

  it.each(failures)("rejects %s", (_label, order) => {
    const result = validateOrder(order);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it("names the offending line in the issue path", () => {
    const result = validateOrder({
      ...validOrder,
      lines: [validLine, { ...validLine, quantity: 0 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toBe("lines[1].quantity");
  });

  it("accepts an empty lines array", () => {
    expect(validateOrder({ ...validOrder, lines: [] }).ok).toBe(true);
  });

  it("collects multiple issues in one pass", () => {
    const result = validateOrder({});
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.path)).toEqual([
        "id",
        "locationId",
        "status",
        "lines",
        "currency",
        "createdAt",
      ]);
  });
});
