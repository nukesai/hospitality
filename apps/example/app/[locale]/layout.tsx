import { hasLocale } from "next-intl";
import { PosIntl } from "@nukesai-pos/frontend/server";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { routing } from "../../i18n/routing";

export const metadata = {
  title: "Nukes POS Example",
  description: "Consumer fixture for the @nukesai-pos packages.",
};

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Root layout lives under [locale] (next-intl routed mode). PosIntl inherits
 * locale+messages from the request config server-side and re-declares the POS
 * fallback behavior on the client — one tag, zero props.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale}>
      <body>
        <PosIntl>{children}</PosIntl>
      </body>
    </html>
  );
}
