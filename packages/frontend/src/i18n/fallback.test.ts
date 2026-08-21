import { IntlError, IntlErrorCode } from "next-intl";
import { describe, expect, it, vi } from "vitest";

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
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => {
      posIntlOnError(new IntlError(IntlErrorCode.MISSING_MESSAGE));
    }).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stays silent on the ENVIRONMENT_FALLBACK advisory", () => {
    // use-intl raises it per relativeTime() call and once per server process
    // for useTranslations when no global timeZone/now is configured. Throwing
    // would turn a healthy fallback into a 500 (and relativeTime re-enters
    // onError with FORMATTING_ERROR, so the second throw escapes the render).
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => {
      posIntlOnError(new IntlError(IntlErrorCode.ENVIRONMENT_FALLBACK));
    }).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("REPORTS real configuration errors without crashing the render", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom = new IntlError(IntlErrorCode.INVALID_MESSAGE, "bad ICU");
    expect(() => {
      posIntlOnError(boom);
    }).not.toThrow();
    expect(spy).toHaveBeenCalledWith(boom);
    spy.mockRestore();
  });
});
