"use client";

import { NextIntlClientProvider, useLocale } from "next-intl";
import type { ComponentProps, ReactElement } from "react";

import { posIntlOnError, posMessageFallback } from "./fallback.js";

export type PosIntlProviderProps = ComponentProps<typeof NextIntlClientProvider>;

/** next-intl's CLIENT provider hard-requires `locale` before it merges any
 *  ancestor context (verified in the compiled dist) — so the inherit path must
 *  read the ancestor's locale itself. Split component keeps hook rules happy.
 *  `locale` is applied AFTER the spread: a caller who passed `locale={undefined}`
 *  explicitly still carries that own key in `rest`, and spreading it last would
 *  clobber the ancestor value and trip next-intl's "couldn't infer" throw. */
function PosIntlFromAncestor({ children, ...rest }: PosIntlProviderProps): ReactElement {
  const locale = useLocale();
  return (
    <NextIntlClientProvider {...rest} locale={locale}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * Client boundary that bakes in the POS fallback behavior (missing key ->
 * dotted path, never a crash — parity with the dependency-free common
 * translator). Use with an explicit `locale` (tests, portals) or nested under
 * a server-rendered provider (`PosIntl` from ./server does exactly that), in
 * which case everything else inherits from the ancestor context.
 * Lives in the NEUTRAL i18n/ dir (a "use client" leaf) so both the client
 * barrel and the server-side PosIntl composition may import it without
 * crossing the server/client zone boundary.
 */
export function PosIntlProvider({ children, ...rest }: PosIntlProviderProps): ReactElement {
  const props: PosIntlProviderProps = {
    onError: posIntlOnError,
    getMessageFallback: posMessageFallback,
    ...rest,
    children,
  };
  return rest.locale === undefined ? (
    <PosIntlFromAncestor {...props} />
  ) : (
    <NextIntlClientProvider {...props} />
  );
}
