import { toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { en } from "@nukesai-pos/frontend/locales/en";
import { ne } from "@nukesai-pos/frontend/locales/ne";
import { OrderTicket, PosI18nProvider } from "@nukesai-pos/frontend/client";
import { createPosServerI18n } from "@nukesai-pos/frontend/server";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

const resources = { en, ne } as const;
type Lng = keyof typeof resources;

// Module scope ONCE; React cache() inside keeps per-request instances isolated.
const serverI18n = createPosServerI18n({ resources });

const demoOrder: Order = {
  id: "order-i18n-demo",
  locationId: toLocationId("demo-main"),
  status: "ready",
  lines: [{ productId: "p1", name: "Momo", quantity: 2, unitPriceMinor: 450 }],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
};

/**
 * Locale-routed demo: the SERVER renders a translated heading via the
 * per-request i18n instance; the CLIENT OrderTicket translates its own labels
 * through PosI18nProvider. The consumer's own routing decides the locale —
 * the packages just follow (100% consumer-aligned localization).
 */
export default async function LocalePage({
  params,
}: {
  readonly params: Promise<{ readonly lng: string }>;
}): Promise<ReactElement> {
  const { lng } = await params;
  // Object.hasOwn: the `in` operator walks the prototype chain (/constructor would pass).
  if (!Object.hasOwn(resources, lng)) notFound();
  const locale = lng as Lng;
  const t = serverI18n.getT(locale);

  return (
    <main>
      <h1>Nukes POS · {locale}</h1>
      <p data-testid="server-translated">{t("order.status.ready")}</p>
      <PosI18nProvider lng={locale} resources={resources}>
        <OrderTicket order={demoOrder} />
      </PosI18nProvider>
    </main>
  );
}
