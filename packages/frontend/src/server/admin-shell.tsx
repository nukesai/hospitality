import { getTranslations } from "next-intl/server";
import type { ReactElement, ReactNode } from "react";

export interface PosAdminShellProps {
  /** Locale passed EXPLICITLY (route param) — root-params/segment detection is
   *  the app's business; explicit locale keeps this component static-renderable. */
  readonly locale: string;
  /** Remaining path segments under the admin mount, e.g. ["orders"]. */
  readonly segments?: readonly string[] | undefined;
  /** Where the admin catch-all is mounted, for nav hrefs. */
  readonly basePath?: string | undefined;
  /** Feature panes render here in later phases; the shell owns chrome + nav. */
  readonly children?: ReactNode;
}

/**
 * The admin panel entry — an async RSC the consumer's ONE admin route file
 * renders:
 *
 *   // app/(nukes-pos)/admin/[[...admin]]/page.tsx
 *   <PosAdminShell locale={locale} segments={admin} />
 *
 * Section routing happens here (package-side), so new admin surfaces ship in
 * the package without touching the consumer's route file again.
 */
export async function PosAdminShell({
  locale,
  segments = [],
  basePath = "/admin",
  children,
}: PosAdminShellProps): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "pos" });
  const section = segments[0] ?? "dashboard";

  return (
    <div data-testid="pos-admin-shell">
      <header>
        <h1>{t("admin.title")}</h1>
      </header>
      <nav aria-label={t("admin.title")}>
        <a href={basePath}>{t("admin.nav.dashboard")}</a>{" "}
        <a href={`${basePath}/orders`}>{t("admin.nav.orders")}</a>
      </nav>
      <main>
        {children
          ?? (section === "orders" ? (
            <p data-testid="admin-orders-empty">{t("admin.orders.empty")}</p>
          ) : (
            <p data-testid="admin-welcome">{t("admin.dashboard.welcome")}</p>
          ))}
      </main>
    </div>
  );
}
