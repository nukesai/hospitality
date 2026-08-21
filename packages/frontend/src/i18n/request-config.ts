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

/**
 * One candidate in the locale cascade: either a value already in hand or a
 * SUPPLIER that is only invoked if every higher-priority candidate missed.
 * Laziness is load-bearing on the server — the request-locale and cookie
 * candidates touch Next's dynamic APIs, which would opt a statically
 * renderable page into dynamic rendering just by being read.
 */
export type PosLocaleCandidate =
  | string
  | null
  | undefined
  | (() => string | null | undefined | Promise<string | null | undefined>);

export interface PosRequestCoreOptions {
  readonly locales?: readonly string[];
  readonly defaultLocale?: string;
  /** Consumer catalogs, MERGED over the shipped loaders (per locale): add a
   *  locale the package does not ship, or replace the catalog of one it does,
   *  without losing the others. */
  readonly posMessages?: PosMessageSource | undefined;
  /** App-own messages, merged AFTER the pos catalog (app wins per leaf). */
  readonly messages?: ((locale: string) => Promise<object> | object) | undefined;
  /** Per-locale leaf overrides, merged last. */
  readonly overrides?: Readonly<Record<string, object>> | undefined;
}

/**
 * First SUPPORTED candidate wins; unsupported values fall through to the next
 * one and an exhausted cascade lands on `defaultLocale`. Suppliers run in
 * order and only while the cascade is still undecided.
 */
export const resolvePosLocale = async (
  candidates: readonly PosLocaleCandidate[],
  locales: readonly string[] = POS_LOCALES,
  defaultLocale: string = POS_DEFAULT_LOCALE,
): Promise<string> => {
  for (const candidate of candidates) {
    const value = typeof candidate === "function" ? await candidate() : candidate;
    if (typeof value === "string" && locales.includes(value)) return value;
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
