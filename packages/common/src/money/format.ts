import type { CurrencyCode } from "../types/index.js";

/**
 * Format an integer minor-unit amount for display. Locale-aware via
 * Intl.NumberFormat, which exists in every supported runtime (Node >= 20,
 * evergreen browsers) — no polyfill, no dependency.
 */
export const formatMoney = (
  amountMinor: number,
  currency: CurrencyCode,
  locale = "en-US",
): string => {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError("formatMoney expects an integer amount in minor units.");
  }
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  /* v8 ignore next 2 -- maximumFractionDigits is always defined for style: "currency"; the ?? arm is typing-only */
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** fractionDigits);
};
