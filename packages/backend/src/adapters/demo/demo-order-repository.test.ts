import { toLocationId } from "@nukesai-pos/common";
import type { CurrencyCode, Order } from "@nukesai-pos/common/types";
import { describe, expect, it } from "vitest";

import { createDemoOrderRepository } from "./demo-order-repository.js";

const LOCATION_A = toLocationId("branch-a");
const LOCATION_B = toLocationId("branch-b");

const order = (overrides: Partial<Order> = {}): Order => ({
  id: "order-1",
  locationId: LOCATION_A,
  status: "pending",
  lines: [{ productId: "p1", name: "Momo", quantity: 2, unitPriceMinor: 450 }],
  currency: "EUR" as CurrencyCode,
  createdAt: 1_755_000_000_000,
  ...overrides,
});

describe("createDemoOrderRepository", () => {
  it("returns null for an unknown order", async () => {
    const repo = createDemoOrderRepository();
    await expect(repo.findById(LOCATION_A, "missing")).resolves.toBeNull();
  });

  it("saves and finds an order within its location", async () => {
    const repo = createDemoOrderRepository();
    await repo.save(LOCATION_A, order());
    await expect(repo.findById(LOCATION_A, "order-1")).resolves.toMatchObject({ id: "order-1" });
  });

  it("isolates locations structurally (branch isolation)", async () => {
    const repo = createDemoOrderRepository([order()]);
    await expect(repo.findById(LOCATION_B, "order-1")).resolves.toBeNull();
  });

  it("lists only orders matching the requested status", async () => {
    const repo = createDemoOrderRepository([order(), order({ id: "order-2", status: "ready" })]);
    const ready = await repo.listByStatus(LOCATION_A, "ready");
    expect(ready.map((entry) => entry.id)).toEqual(["order-2"]);
  });

  it("rejects structurally invalid orders", async () => {
    const repo = createDemoOrderRepository();
    await expect(repo.save(LOCATION_A, { ...order(), id: "" })).rejects.toThrow(
      /^Invalid order: id:/,
    );
  });

  it("rejects a save whose order belongs to another location", async () => {
    const repo = createDemoOrderRepository();
    await expect(repo.save(LOCATION_B, order())).rejects.toThrow(/Branch isolation is strict/);
  });

  it("updates the status of an existing order", async () => {
    const repo = createDemoOrderRepository([order()]);
    await expect(repo.updateStatus(LOCATION_A, "order-1", "preparing")).resolves.toMatchObject({
      status: "preparing",
    });
    await expect(repo.findById(LOCATION_A, "order-1")).resolves.toMatchObject({
      status: "preparing",
    });
  });

  it("returns null when updating a missing order", async () => {
    const repo = createDemoOrderRepository();
    await expect(repo.updateStatus(LOCATION_A, "missing", "ready")).resolves.toBeNull();
  });
});
