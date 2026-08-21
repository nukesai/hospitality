/** Locales the packaged catalogs ship translations for. */
export const POS_LOCALES = ["en", "ne"] as const;
export type PosLocale = (typeof POS_LOCALES)[number];
export const POS_DEFAULT_LOCALE: PosLocale = "en";

/**
 * The routing shape shared by the proxy factory and consumer templates —
 * structurally a next-intl RoutingConfig (whose defineRouting() is identity
 * plus domain validation, and we define no domains); owning the interface
 * keeps next-intl's five-generic type out of our public dts.
 *
 * `L` carries the LITERAL locale tuple so the scaffolded next-intl
 * augmentation (`Locale: (typeof routing.locales)[number]`) narrows to a union
 * instead of decaying to `string` — that augmentation is the only thing making
 * `getTranslations({ locale })` and the navigation APIs typo-proof.
 */
export interface PosRouting<L extends readonly string[] = readonly string[]> {
  readonly locales: L;
  readonly defaultLocale: string;
  /** next-intl localePrefix mode; "as-needed" keeps the default locale unprefixed. */
  readonly localePrefix?: "always" | "as-needed" | "never";
  readonly localeDetection?: boolean;
  readonly localeCookie?: boolean;
}

export interface PosRoutingOptions<L extends readonly string[] = readonly string[]> {
  readonly locales?: L;
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
 * The `const` type parameter infers `["en", "fr"]` as a literal tuple with no
 * `as const` at the call site.
 */
export const definePosRouting = <const L extends readonly string[] = typeof POS_LOCALES>(
  options: PosRoutingOptions<L> = {},
): PosRouting<L> => ({
  // Sound by construction: when `locales` is omitted L defaults to the type of
  // POS_LOCALES, which is exactly what the fallback supplies.
  locales: options.locales ?? (POS_LOCALES as readonly string[] as L),
  defaultLocale: options.defaultLocale ?? POS_DEFAULT_LOCALE,
  localePrefix: options.localePrefix ?? "as-needed",
  ...(options.localeDetection !== undefined ? { localeDetection: options.localeDetection } : {}),
  ...(options.localeCookie !== undefined ? { localeCookie: options.localeCookie } : {}),
});
