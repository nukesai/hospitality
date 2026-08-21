import "server-only";

import type { AbstractIntlMessages, Formats, IntlError } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { posIntlOnError, posMessageFallback } from "../i18n/fallback.js";
import {
  buildPosMessages,
  resolvePosLocale,
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
  /**
   * IANA time zone for every date/time format. Without one next-intl formats
   * in the SERVER's zone (which differs from the visitor's) and raises an
   * ENVIRONMENT_FALLBACK advisory on every call.
   */
  readonly timeZone?: string | undefined;
  /** Fixed "now" for relativeTime(), keeping SSR and hydration identical. */
  readonly now?: Date | undefined;
  /** Global format presets, e.g. `{ dateTime: { short: { … } } }`. */
  readonly formats?: Formats | undefined;
  /** Replace the POS reporter (advisories silent, faults console.error'd). */
  readonly onError?: ((error: IntlError) => void) | undefined;
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
  readonly timeZone?: string;
  readonly now?: Date;
  readonly formats?: Formats;
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
 * resolveLocale() → the [locale] segment → cookie → default, each source read
 * ONLY while the cascade is undecided; messages merge pos-catalog ← app ←
 * overrides, so a consumer can override any single string.
 */
export const createPosRequestConfig = (options: PosRequestConfigOptions = {}): PosRequestConfig => {
  const locales = options.locales ?? POS_LOCALES;
  const defaultLocale = options.defaultLocale ?? POS_DEFAULT_LOCALE;
  // Consumer catalogs LAYER over the shipped ones: adding "fr" must not drop
  // the en/ne the package ships (a silent regression — missing messages render
  // as their key path by design).
  const posMessages = { ...posMessageLoaders, ...options.posMessages };

  // `requestLocale` is a lazy getter on next-intl's params object (verified in
  // the compiled dist): destructuring it would read request headers even when a
  // higher-priority candidate already decided the locale, so params is kept
  // whole and every dynamic source stays behind a supplier.
  return getRequestConfig(async (params) => {
    const locale = await resolvePosLocale(
      [
        params.locale,
        options.resolveLocale,
        // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/promise-function-async -- deliberate compatibility bridge: requestLocale still carries the [locale] segment for apps not yet on next/root-params (deprecated upstream in 4.13.6); consumers opt into the successor via resolveLocale. Reading it must stay a plain getter access so the supplier can stay unread.
        () => params.requestLocale,
        async () => {
          if (options.cookieName === false) return null;
          const store = await cookies();
          return store.get(options.cookieName ?? "NEXT_LOCALE")?.value ?? null;
        },
      ],
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
      onError: options.onError ?? posIntlOnError,
      getMessageFallback: posMessageFallback,
      ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.formats === undefined ? {} : { formats: options.formats }),
    };
  }) as PosRequestConfig;
};
