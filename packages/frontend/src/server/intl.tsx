import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { PosIntlProvider } from "../i18n/provider.js";

export interface PosIntlProps {
  readonly children: ReactNode;
  /** Normally omitted: next-intl's server build inherits locale/messages from
   *  the request config. Explicit values exist for tests and edge setups. */
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
  return (
    <Provider
      {...(locale === undefined ? {} : { locale })}
      {...(messages === undefined ? {} : { messages })}
    >
      <PosIntlProvider>{children}</PosIntlProvider>
    </Provider>
  );
}
