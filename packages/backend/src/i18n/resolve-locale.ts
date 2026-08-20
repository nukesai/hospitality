import { createTranslator, type Messages, type Translator } from "@nukesai-pos/common/i18n";
import { en } from "@nukesai-pos/common/i18n/locales/en";
import { ne } from "@nukesai-pos/common/i18n/locales/ne";

export interface LocaleConfig {
  readonly defaultLocale: string;
  readonly messagesByLocale: Readonly<Record<string, Messages>>;
}

/** Bundled machine-message catalogs (common translator syntax: single-brace). */
export const defaultLocaleConfig = (defaultLocale: string): LocaleConfig => ({
  defaultLocale,
  messagesByLocale: { en, ne },
});

/** Minimal Accept-Language matcher: first supported primary tag wins. */
export const resolveLocale = (
  config: LocaleConfig,
  userPreference: string | undefined,
  acceptLanguage: string | null,
): string => {
  if (userPreference !== undefined && userPreference in config.messagesByLocale) {
    return userPreference;
  }
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
    if (tag !== undefined && tag in config.messagesByLocale) return tag;
  }
  return config.defaultLocale;
};

/** Pure per-request translator over the common catalog — zero shared state. */
export const createRequestTranslator = (config: LocaleConfig, locale: string): Translator =>
  createTranslator(
    config.messagesByLocale[locale] ?? config.messagesByLocale[config.defaultLocale] ?? {},
  );
