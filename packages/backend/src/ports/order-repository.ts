import type { LocationId, Order, OrderStatus } from "@nukesai-pos/common/types";

/**
 * Persistence port for orders. Interfaces only — the data layer is deferred by
 * design. A future Drizzle/Prisma/SQL adapter implements this in a new
 * `src/adapters/<driver>/` directory and is exposed as a new export subpath;
 * the public API of the package never changes.
 *
 * Every method takes `locationId` FIRST: the data model is a flat database with
 * hard per-location (branch) isolation. Explicitly not multi-tenant SaaS.
 */
export interface OrderRepository {
  findById: (locationId: LocationId, orderId: string) => Promise<Order | null>;
  listByStatus: (locationId: LocationId, status: OrderStatus) => Promise<readonly Order[]>;
  save: (locationId: LocationId, order: Order) => Promise<Order>;
  updateStatus: (
    locationId: LocationId,
    orderId: string,
    status: OrderStatus,
  ) => Promise<Order | null>;
}
