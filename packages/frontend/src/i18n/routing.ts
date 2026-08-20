/** Locales the packaged catalogs ship translations for. */
export const POS_LOCALES = ["en", "ne"] as const;
export type PosLocale = (typeof POS_LOCALES)[number];
export const POS_DEFAULT_LOCALE: PosLocale = "en";

/**
 * The routing shape shared by the proxy factory and consumer templates —
 * structurally a next-intl RoutingConfig (whose defineRouting() is identity
 * plus domain validation, and we define no domains); owning the interface
 * keeps next-intl's five-generic type out of our public dts.
 */
export interface PosRouting {
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  /** next-intl localePrefix mode; "as-needed" keeps the default locale unprefixed. */
  readonly localePrefix?: "always" | "as-needed" | "never";
  readonly localeDetection?: boolean;
  readonly localeCookie?: boolean;
}

export interface PosRoutingOptions {
  readonly locales?: readonly string[];
  readonly defaultLocale?: string;
  readonly localePrefix?: "always" | "as-needed" | "never";
  readonly localeDetection?: boolean;
  readonly localeCookie?: boolean;
}

/**
 * Routing definition for locale-prefixed apps (the WITH-routing mode). The
 * consumer's `i18n/routing.ts` is a one-liner over this; `createPosProxy` and
 * next-intl's `createNavigation` both accept the result. Apps without locale
 * URLs skip routing entirely — the request config negotiates instead.
 */
export const definePosRouting = (options: PosRoutingOptions = {}): PosRouting => ({
  locales: options.locales ?? POS_LOCALES,
  defaultLocale: options.defaultLocale ?? POS_DEFAULT_LOCALE,
  localePrefix: options.localePrefix ?? "as-needed",
  ...(options.localeDetection !== undefined ? { localeDetection: options.localeDetection } : {}),
  ...(options.localeCookie !== undefined ? { localeCookie: options.localeCookie } : {}),
});
