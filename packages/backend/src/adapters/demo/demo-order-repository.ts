import "server-only";

import { assertServerRuntime, validateOrder } from "@nukesai-pos/common";
import type { LocationId, Order, OrderStatus } from "@nukesai-pos/common/types";

import type { OrderRepository } from "../../ports/order-repository.js";

assertServerRuntime("@nukesai-pos/backend/adapters/demo");

/** Simulated IO tick: keeps the demo honest about the async port contract. */
const io = async (): Promise<void> => {
  await Promise.resolve();
};

/**
 * In-memory reference implementation of the OrderRepository port. Exists so the
 * foundation ships a working, fully tested adapter shape before the real data
 * layer is chosen. Never use in production.
 */
export function createDemoOrderRepository(seed: readonly Order[] = []): OrderRepository {
  // Location isolation is structural: one bucket per LocationId, never queried across.
  const byLocation = new Map<LocationId, Map<string, Order>>();

  const bucket = (locationId: LocationId): Map<string, Order> => {
    const existing = byLocation.get(locationId);
    if (existing !== undefined) return existing;
    const created = new Map<string, Order>();
    byLocation.set(locationId, created);
    return created;
  };

  for (const order of seed) {
    bucket(order.locationId).set(order.id, order);
  }

  return {
    findById: async (locationId, orderId): Promise<Order | null> => {
      await io();
      return bucket(locationId).get(orderId) ?? null;
    },

    listByStatus: async (locationId, status): Promise<readonly Order[]> => {
      await io();
      return [...bucket(locationId).values()].filter((order) => order.status === status);
    },

    save: async (locationId, order): Promise<Order> => {
      await io();
      const result = validateOrder(order);
      if (!result.ok) {
        const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
        throw new Error(`Invalid order: ${details}`);
      }
      if (order.locationId !== locationId) {
        throw new Error(
          "Order.locationId does not match the repository call. Branch isolation is strict.",
        );
      }
      bucket(locationId).set(order.id, order);
      return order;
    },

    updateStatus: async (locationId, orderId, status: OrderStatus): Promise<Order | null> => {
      await io();
      const existing = bucket(locationId).get(orderId);
      if (existing === undefined) return null;
      const updated: Order = { ...existing, status };
      bucket(locationId).set(orderId, updated);
      return updated;
    },
  };
}
