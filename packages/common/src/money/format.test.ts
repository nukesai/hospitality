import { describe, expect, it } from "vitest";

import { toLocationId } from "../constants/locations.js";
import type { CurrencyCode } from "../types/index.js";
import { formatMoney } from "./format.js";

const EUR = "EUR" as CurrencyCode;
const JPY = "JPY" as CurrencyCode;

describe("formatMoney", () => {
  it("formats minor units for two-decimal currencies", () => {
    expect(formatMoney(1250, EUR)).toBe("€12.50");
  });

  it("formats zero-decimal currencies without dividing by 100", () => {
    expect(formatMoney(1250, JPY)).toBe("¥1,250");
  });

  it("honours the locale parameter", () => {
    expect(formatMoney(1250, EUR, "de-DE")).toBe("12,50\u00A0€");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatMoney(12.5, EUR)).toThrow(
      "formatMoney expects an integer amount in minor units.",
    );
  });

  it("keeps LocationId branding compatible with plain strings", () => {
    // Exercises the branded-type helper alongside money to mirror real call sites.
    expect(toLocationId("branch-2")).toBe("branch-2");
  });
});
