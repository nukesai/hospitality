import { IntlError, IntlErrorCode } from "next-intl";
import { describe, expect, it } from "vitest";

import { posIntlOnError, posMessageFallback } from "./fallback.js";

describe("posMessageFallback", () => {
  const error = new IntlError(IntlErrorCode.MISSING_MESSAGE);

  it("renders the dotted path minus the pos namespace (wire-key parity)", () => {
    expect(posMessageFallback({ namespace: "pos", key: "errors.internal", error })).toBe(
      "errors.internal",
    );
    expect(posMessageFallback({ namespace: "pos.order", key: "unknown", error })).toBe(
      "order.unknown",
    );
  });

  it("keeps non-pos namespaces intact", () => {
    expect(posMessageFallback({ namespace: "app", key: "greeting", error })).toBe("app.greeting");
    expect(posMessageFallback({ key: "rootKey", error })).toBe("rootKey");
  });
});

describe("posIntlOnError", () => {
  it("swallows missing-message errors (fallback renders the key)", () => {
    expect(() => {
      posIntlOnError(new IntlError(IntlErrorCode.MISSING_MESSAGE));
    }).not.toThrow();
  });

  it("throws loudly on real configuration errors", () => {
    const boom = new IntlError(IntlErrorCode.INVALID_MESSAGE, "bad ICU");
    expect(() => {
      posIntlOnError(boom);
    }).toThrow(boom);
  });
});
