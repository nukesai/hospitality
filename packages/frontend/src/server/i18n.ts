import "server-only";

import type { AbstractIntlMessages, IntlError } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { posIntlOnError, posMessageFallback } from "../i18n/fallback.js";
import {
  buildPosMessages,
  pickPosLocale,
  type PosRequestCoreOptions,
} from "../i18n/request-config.js";
import { POS_DEFAULT_LOCALE, POS_LOCALES } from "../i18n/routing.js";
import { posMessageLoaders } from "../locales/loaders.js";

export interface PosRequestConfigOptions extends PosRequestCoreOptions {
  /**
   * App-side locale source, e.g. `next/root-params`'s `locale` in routed apps
   * or a session lookup. Runs before the cookie fallback.
   */
  readonly resolveLocale?: (() => Promise<string | null | undefined>) | undefined;
  /**
   * Cookie consulted when nothing else matched (the WITHOUT-routing mode).
   * next-intl's own locale cookie by default; `false` disables the read —
   * required for fully static routed apps, where a cookie read would force
   * dynamic rendering.
   */
  readonly cookieName?: string | false | undefined;
}

/** What the resolver hands next-intl per request. */
export interface PosResolvedRequestConfig {
  readonly locale: string;
  readonly messages: AbstractIntlMessages;
  readonly onError: (error: IntlError) => void;
  readonly getMessageFallback: (info: {
    readonly namespace?: string;
    readonly key: string;
    readonly error: IntlError;
  }) => string;
}

/**
 * The aliased `i18n/request.ts` module's default-export shape. Structural on
 * purpose: next-intl consumes it through a bundler alias (no TS boundary), and
 * naming it keeps getRequestConfig's internal type out of our dts
 * (isolatedDeclarations).
 */
export type PosRequestConfig = (params: {
  readonly locale?: string;
  /** Deprecated upstream (root-params supersedes it) — carried for compatibility. */
  readonly requestLocale?: Promise<string | undefined>;
}) => Promise<PosResolvedRequestConfig>;

/**
 * THE request config factory. The consumer file is a one-liner —
 *
 *   // i18n/request.ts
 *   import { createPosRequestConfig } from "@nukesai-pos/frontend/server";
 *   export default createPosRequestConfig();
 *
 * — because next-intl's plugin aliases `next-intl/config` to exactly one
 * app-local RELATIVE file (package specifiers are not supported; verified in
 * plugin source). Locale cascade: explicit (getTranslations({locale})) →
 * resolveLocale() → cookie → default; messages merge pos-catalog ← app ←
 * overrides, so a consumer can override any single string.
 */
export const createPosRequestConfig = (options: PosRequestConfigOptions = {}): PosRequestConfig => {
  const locales = options.locales ?? POS_LOCALES;
  const defaultLocale = options.defaultLocale ?? POS_DEFAULT_LOCALE;
  const posMessages = options.posMessages ?? posMessageLoaders;

  // Cascade: explicit (getTranslations({locale})) > app resolver > the
  // [locale] segment next-intl forwards in routed apps > cookie > default.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- deliberate compatibility bridge: requestLocale still carries the [locale] segment for apps not yet on next/root-params (deprecated upstream in 4.13.6); consumers opt into the successor via resolveLocale.
  return getRequestConfig(async ({ locale: explicitLocale, requestLocale }) => {
    const resolvedLocale = (await options.resolveLocale?.()) ?? (await requestLocale);
    let cookieLocale: string | null = null;
    if (options.cookieName !== false) {
      const store = await cookies();
      cookieLocale = store.get(options.cookieName ?? "NEXT_LOCALE")?.value ?? null;
    }
    const locale = pickPosLocale(
      { explicitLocale, resolvedLocale, cookieLocale },
      locales,
      defaultLocale,
    );
    return {
      locale,
      messages: (await buildPosMessages(
        locale,
        defaultLocale,
        posMessages,
        options,
      )) as AbstractIntlMessages,
      onError: posIntlOnError,
      getMessageFallback: posMessageFallback,
    };
  }) as PosRequestConfig;
};
