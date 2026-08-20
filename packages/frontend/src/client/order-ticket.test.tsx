import { toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrderTicket } from "./order-ticket.js";

const order: Order = {
  id: "order-9",
  locationId: toLocationId("branch-a"),
  status: "ready",
  lines: [
    { productId: "p1", name: "Momo", quantity: 2, unitPriceMinor: 450 },
    { productId: "p2", name: "Chiya", quantity: 1, unitPriceMinor: 150 },
  ],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
};

describe("OrderTicket", () => {
  it("renders lines and the computed total", () => {
    render(<OrderTicket order={order} />);
    expect(screen.getByText("2 × Momo")).toBeInTheDocument();
    expect(screen.getByText("1 × Chiya")).toBeInTheDocument();
    expect(screen.getByText("€10.50")).toBeInTheDocument();
  });

  it("acknowledges once and disables the button", async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    render(<OrderTicket order={order} onAcknowledge={onAcknowledge} />);

    const button = screen.getByRole("button", { name: "Acknowledge" });
    await user.click(button);

    expect(onAcknowledge).toHaveBeenCalledExactlyOnceWith("order-9");
    expect(screen.getByRole("button", { name: "Acknowledged" })).toBeDisabled();
  });

  it("works without an onAcknowledge callback", async () => {
    const user = userEvent.setup();
    render(<OrderTicket order={order} />);
    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(screen.getByRole("button", { name: "Acknowledged" })).toBeDisabled();
  });
});
