import { DEMO_LOCATION_ID, toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { createDemoOrderRepository } from "@nukesai-pos/backend/adapters/demo";
import { OrderTicket } from "@nukesai-pos/frontend/client";
import { OrderSummary } from "@nukesai-pos/frontend/server";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { routing } from "../../i18n/routing";

const seed: Order = {
  id: "order-1",
  locationId: toLocationId("demo-main"),
  status: "ready",
  lines: [
    { productId: "p1", name: "Momo", quantity: 2, unitPriceMinor: 450 },
    { productId: "p2", name: "Chiya", quantity: 1, unitPriceMinor: 150 },
  ],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
};

/**
 * Exercises all three packages across the server/client boundary exactly the
 * way a customer app would: backend adapter in the RSC graph, RSC component
 * from frontend/server, interactive leaf from frontend/client — all localized
 * through ONE next-intl request config. The h1 text is the e2e smoke contract;
 * data-testid="server-translated" is the i18n e2e contract.
 */
export default async function HomePage({
  params,
}: {
  readonly params: Promise<{ readonly locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  // The AppConfig augmentation types `locale` as the routing union, so the
  // narrow is what makes an unknown segment a 404 instead of a silent
  // fallback render.
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "pos" });
  const repository = createDemoOrderRepository([seed]);
  const order = await repository.findById(DEMO_LOCATION_ID, "order-1");

  return (
    <main>
      <h1>Nukes POS</h1>
      <p data-testid="server-translated">{t("order.status.ready")}</p>
      {order === null ? (
        <p>No demo order found.</p>
      ) : (
        <>
          <OrderSummary order={order} />
          <OrderTicket order={order} />
        </>
      )}
    </main>
  );
}
