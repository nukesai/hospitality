// THE admin route: one file, the frontend package handles everything inside.
import { PosAdminShell } from "@nukesai-pos/frontend/server";
import type { ReactElement } from "react";

import { routing } from "../../../../../i18n/routing";

export default async function AdminPage({
  params,
}: {
  readonly params: Promise<{ readonly locale: string; readonly admin?: readonly string[] }>;
}): Promise<ReactElement> {
  const { locale, admin } = await params;
  // as-needed prefixes: the default locale's admin lives at /admin, others at /{locale}/admin.
  const basePath = locale === routing.defaultLocale ? "/admin" : `/${locale}/admin`;
  return <PosAdminShell locale={locale} segments={admin ?? []} basePath={basePath} />;
}
