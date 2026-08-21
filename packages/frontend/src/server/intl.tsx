import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

import { PosIntlProvider } from "../i18n/provider.js";

export interface PosIntlProps {
  readonly children: ReactNode;
  /**
   * Pass the `[locale]` segment in routed apps: it primes next-intl's request
   * cache (`setRequestLocale`), which is the ONLY way the locale-less server
   * APIs used downstream resolve without reading `headers()` — and a header
   * read opts the whole page tree out of static rendering. Omit it in
   * cookie-negotiated apps, where rendering is dynamic by definition.
   */
  readonly locale?: string;
  readonly messages?: Record<string, unknown>;
}

// Facade at the boundary: next-intl's published provider props are
// exactOptionalPropertyTypes-hostile unions that differ per react-server/
// react-client build; the runtime props used here are a strict subset, and the
// facade keeps that type churn out of our dts.
const Provider = NextIntlClientProvider as unknown as (props: {
  readonly children: ReactNode;
  readonly locale?: string;
  readonly messages?: Record<string, unknown>;
}) => ReactElement;

/**
 * ONE tag for the consumer root layout:
 *
 *   <PosIntl>{children}</PosIntl>
 *
 * Composition (the next-intl v4 contract): the OUTER zero-prop
 * NextIntlClientProvider must render from a Server Component — its
 * react-server build serializes locale+messages from the request config to the
 * client. onError/getMessageFallback are deliberately NOT serializable, so the
 * INNER "use client" PosIntlProvider re-declares the POS fallback behavior;
 * nested providers inherit everything else from their ancestor.
 */
export function PosIntl({ children, locale, messages }: PosIntlProps): ReactElement {
  // Must run BEFORE any next-intl API in this render pass; everything below
  // (the provider's server build, PosAdminShell, packaged RSCs) then resolves
  // from the cache instead of the request headers.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- deliberate compatibility bridge: next-intl points at next/root-params, which is Next-16-only and unavailable to apps still on the [locale] segment. setRequestLocale is the supported path for them and is a no-op cache write; the successor is tracked in .nukes/RESEARCH-INTEGRATION.md.
  if (locale !== undefined) setRequestLocale(locale);
  return (
    <Provider
      {...(locale === undefined ? {} : { locale })}
      {...(messages === undefined ? {} : { messages })}
    >
      <PosIntlProvider>{children}</PosIntlProvider>
    </Provider>
  );
}
