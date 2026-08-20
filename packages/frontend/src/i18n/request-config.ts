import { mergePosMessages, type MessageTree } from "./merge.js";
import { POS_DEFAULT_LOCALE, POS_LOCALES } from "./routing.js";

/**
 * The PURE core of the request config (framework-free, 100% unit-covered).
 * `createPosRequestConfig` in server/i18n binds it to next-intl's
 * getRequestConfig + next/headers; the cascade itself never touches either.
 */
/** Static per-locale loader map — NEVER a template-literal dynamic import
 *  (bundlers cannot statically resolve those inside node_modules). `object`
 *  (not an indexed record) so interface-typed catalogs assign cleanly. */
export type PosMessageSource = Readonly<Record<string, () => Promise<object> | object>>;

export interface PosLocaleRequest {
  /** Locale next-intl passed explicitly (e.g. getTranslations({locale})). */
  readonly explicitLocale?: string | undefined;
  /** App-resolved candidate, e.g. `await rootParams.locale()` or a session value. */
  readonly resolvedLocale?: string | null | undefined;
  /** Cookie value, when the server shim read one. */
  readonly cookieLocale?: string | null | undefined;
}

export interface PosRequestCoreOptions {
  readonly locales?: readonly string[];
  readonly defaultLocale?: string;
  /** Consumer catalogs for extra locales / full overrides of the shipped ones. */
  readonly posMessages?: PosMessageSource | undefined;
  /** App-own messages, merged AFTER the pos catalog (app wins per leaf). */
  readonly messages?: ((locale: string) => Promise<object> | object) | undefined;
  /** Per-locale leaf overrides, merged last. */
  readonly overrides?: Readonly<Record<string, object>> | undefined;
}

/** First supported candidate wins: explicit > resolved > cookie > default. */
export const pickPosLocale = (
  request: PosLocaleRequest,
  locales: readonly string[] = POS_LOCALES,
  defaultLocale: string = POS_DEFAULT_LOCALE,
): string => {
  for (const candidate of [request.explicitLocale, request.resolvedLocale, request.cookieLocale]) {
    if (typeof candidate === "string" && locales.includes(candidate)) return candidate;
  }
  return defaultLocale;
};

/**
 * Builds the merged message tree for one locale:
 * shipped/consumer pos catalog ← app messages ← per-locale overrides.
 * An unknown locale falls back to the default catalog so rendering never
 * crashes on a half-configured locale (parity with the common translator).
 */
export const buildPosMessages = async (
  locale: string,
  defaultLocale: string,
  posMessages: PosMessageSource,
  options: Pick<PosRequestCoreOptions, "messages" | "overrides"> = {},
): Promise<MessageTree> => {
  const loader = posMessages[locale] ?? posMessages[defaultLocale];
  const pos = loader === undefined ? {} : await loader();
  const app = options.messages === undefined ? undefined : await options.messages(locale);
  return mergePosMessages(pos, app, options.overrides?.[locale]);
};
