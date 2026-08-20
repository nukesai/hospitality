import { toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderSummary } from "./order-summary.js";

const order: Order = {
  id: "order-3",
  locationId: toLocationId("branch-a"),
  status: "preparing",
  lines: [{ productId: "p1", name: "Sekuwa", quantity: 3, unitPriceMinor: 900 }],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
};

describe("OrderSummary", () => {
  it("renders the order header, status, item count and total", () => {
    render(<OrderSummary order={order} />);
    expect(screen.getByRole("heading", { name: "order-3" })).toBeInTheDocument();
    expect(screen.getByText("Status: preparing")).toBeInTheDocument();
    expect(screen.getByText("Items: 1")).toBeInTheDocument();
    expect(screen.getByText("Total: €27.00")).toBeInTheDocument();
  });
});
