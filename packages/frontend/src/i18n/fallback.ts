import { IntlErrorCode, type IntlError } from "next-intl";

/**
 * Parity with the dependency-free common translator: a missing key renders as
 * its dotted path (minus the library namespace) instead of crashing or spamming
 * the console — the exact behavior the old engine had and the e2e smoke test's
 * zero-pageerror assertion relies on.
 */
export const posMessageFallback = (info: {
  readonly namespace?: string;
  readonly key: string;
  readonly error: IntlError;
}): string => {
  const path = [info.namespace, info.key].filter(Boolean).join(".");
  return path.startsWith("pos.") ? path.slice("pos.".length) : path;
};

/** Missing messages fall back silently (see above); real config/ICU errors throw loudly. */
export const posIntlOnError = (error: IntlError): void => {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) return;
  throw error;
};
