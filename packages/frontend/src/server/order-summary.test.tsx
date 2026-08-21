import { toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PosIntlProvider } from "../i18n/provider.js";
import { en } from "../locales/en.js";
import { ne } from "../locales/ne.js";
import { OrderSummary } from "./order-summary.js";

const order: Order = {
  id: "order-7",
  locationId: toLocationId("branch-a"),
  status: "preparing",
  lines: [
    { productId: "p1", name: "Momo", quantity: 2, unitPriceMinor: 450 },
    { productId: "p2", name: "Chiya", quantity: 1, unitPriceMinor: 150 },
  ],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
};

describe("OrderSummary", () => {
  it("renders the order header, status, item count and total", () => {
    render(
      <PosIntlProvider locale="en" messages={en}>
        <OrderSummary order={order} />
      </PosIntlProvider>,
    );
    expect(screen.getByRole("heading", { name: "order-7" })).toBeInTheDocument();
    expect(screen.getByText("Status: Preparing")).toBeInTheDocument();
    expect(screen.getByText("Items: 2")).toBeInTheDocument();
    expect(screen.getByText("Total: €10.50")).toBeInTheDocument();
  });

  it("translates the whole summary including the status value (ne)", () => {
    render(
      <PosIntlProvider locale="ne" messages={ne}>
        <OrderSummary order={order} />
      </PosIntlProvider>,
    );
    expect(screen.getByText("स्थिति: तयारी हुँदै")).toBeInTheDocument();
    expect(screen.getByText("जम्मा: €10.50")).toBeInTheDocument();
  });
});
