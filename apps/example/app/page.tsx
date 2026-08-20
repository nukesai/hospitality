import { DEMO_LOCATION_ID, toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { createDemoOrderRepository } from "@nukesai-pos/backend/adapters/demo";
import { OrderTicket } from "@nukesai-pos/frontend/client";
import { OrderSummary } from "@nukesai-pos/frontend/server";
import type { ReactElement } from "react";

const seed: Order = {
  id: "order-1",
  locationId: toLocationId("demo-main"),
  status: "pending",
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
 * from frontend/server, interactive leaf from frontend/client receiving only
 * serializable props. The h1 text is the contract with e2e/smoke.spec.ts.
 */
export default async function HomePage(): Promise<ReactElement> {
  const repository = createDemoOrderRepository([seed]);
  const order = await repository.findById(DEMO_LOCATION_ID, "order-1");

  return (
    <main>
      <h1>Nukes POS</h1>
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
