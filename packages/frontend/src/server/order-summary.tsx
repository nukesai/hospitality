import { formatMoney } from "@nukesai-pos/common";
import type { Order } from "@nukesai-pos/common/types";
import type { ReactElement } from "react";

export interface OrderSummaryProps {
  readonly order: Order;
}

/**
 * Demo React Server Component. Deliberately a SYNC pure function so it is
 * unit-testable with React Testing Library; async RSC shells (data fetching)
 * must stay thin wrappers around pure components like this one.
 */
export function OrderSummary({ order }: OrderSummaryProps): ReactElement {
  const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);

  return (
    <section aria-label={`Summary for order ${order.id}`}>
      <h2>{order.id}</h2>
      <p>Status: {order.status}</p>
      <p>Items: {order.lines.length}</p>
      <p>Total: {formatMoney(total, order.currency)}</p>
    </section>
  );
}
