import { hasLocale } from "next-intl";
import { PosIntl } from "@nukesai-pos/frontend/server";
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { routing } from "../../i18n/routing";

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Locale segment layout — NESTED inside your own root layout, so your <html>,
 * <body> and metadata stay yours. Passing `locale` is what makes the subtree
 * statically renderable: PosIntl primes next-intl's request cache with it, and
 * without that every page below falls back to reading request headers.
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

  return <PosIntl locale={locale}>{children}</PosIntl>;
}
