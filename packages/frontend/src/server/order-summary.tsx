import { formatMoney } from "@nukesai-pos/common";
import type { Order } from "@nukesai-pos/common/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export interface OrderSummaryProps {
  readonly order: Order;
}

/**
 * Demo React Server Component. Deliberately a SYNC pure function so it is
 * unit-testable with React Testing Library; async RSC shells (data fetching)
 * must stay thin wrappers around pure components like this one. useTranslations
 * (no directive) renders in the RSC graph via next-intl's react-server build
 * and under any client provider in tests.
 */
export function OrderSummary({ order }: OrderSummaryProps): ReactElement {
  const t = useTranslations("pos");
  const total = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);

  return (
    <section aria-label={`Summary for order ${order.id}`}>
      <h2>{order.id}</h2>
      <p>{t("order.summary.status", { status: t(`order.status.${order.status}`) })}</p>
      <p>{t("order.summary.items", { count: String(order.lines.length) })}</p>
      <p>{t("order.total", { amount: formatMoney(total, order.currency) })}</p>
    </section>
  );
}
