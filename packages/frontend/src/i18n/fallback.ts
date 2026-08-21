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

/**
 * Codes next-intl raises for HEALTHY fallbacks, not for faults (verified in the
 * use-intl 4.13.7 production dist):
 * - MISSING_MESSAGE — the key is absent; `posMessageFallback` renders the path.
 * - ENVIRONMENT_FALLBACK — no global `timeZone`/`now` was configured, so the
 *   runtime's own value is used. `format.relativeTime()` raises it on EVERY
 *   call and `useTranslations` once per server process.
 * Both are advisories the render cannot act on, so both stay silent.
 */
const POS_INTL_ADVISORIES: readonly IntlErrorCode[] = [
  IntlErrorCode.MISSING_MESSAGE,
  IntlErrorCode.ENVIRONMENT_FALLBACK,
];

/**
 * THE reporter installed everywhere (request config + client provider).
 *
 * It never throws. use-intl invokes `onError` from inside its own catch blocks
 * and then returns a degraded value, so a throw here turns a fallback into a
 * 500 — and `relativeTime` re-enters `onError` with FORMATTING_ERROR, whose
 * second throw escapes the render entirely. Faults are REPORTED (next-intl's
 * own default behavior) so they stay visible in logs; pass `onError` to
 * `createPosRequestConfig`/`PosIntlProvider` to route them elsewhere.
 */
export const posIntlOnError = (error: IntlError): void => {
  if (POS_INTL_ADVISORIES.includes(error.code)) return;
  console.error(error);
};
