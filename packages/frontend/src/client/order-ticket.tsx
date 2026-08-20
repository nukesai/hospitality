"use client";

import { formatMoney } from "@nukesai-pos/common";
import type { Order } from "@nukesai-pos/common/types";
import { type ReactElement, useState } from "react";

import { useTranslations } from "next-intl";

export interface OrderTicketProps {
  readonly order: Order;
  /** Called when staff acknowledges the ticket. Serializable-props boundary. */
  readonly onAcknowledge?: (orderId: string) => void;
}

/**
 * Demo interactive client leaf. `"use client"` lives HERE, on the leaf — never
 * on the barrel — so consumers who import only server components ship none of
 * this to the browser.
 */
export function OrderTicket({ order, onAcknowledge }: OrderTicketProps): ReactElement {
  const [acknowledged, setAcknowledged] = useState(false);
  const t = useTranslations("pos");

  const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);

  return (
    <article aria-label={`Order ${order.id}`}>
      <header>
        <strong>{order.id}</strong> — {order.status}
      </header>
      <ul>
        {order.lines.map((line) => (
          <li key={line.productId}>
            {line.quantity} × {line.name}
          </li>
        ))}
      </ul>
      <footer>{formatMoney(total, order.currency)}</footer>
      <button
        type="button"
        disabled={acknowledged}
        onClick={() => {
          setAcknowledged(true);
          onAcknowledge?.(order.id);
        }}
      >
        {acknowledged ? t("order.acknowledged") : t("order.acknowledge")}
      </button>
    </article>
  );
}
