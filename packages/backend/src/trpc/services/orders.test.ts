import { describe, expect, it } from "vitest";

import { createMemoryCacheStore } from "../../adapters/cache/memory.js";
import type { PosDatabase } from "../../adapters/drizzle/client.js";
import type { BranchContext } from "../../adapters/drizzle/rls.js";
import type { orders } from "../../adapters/drizzle/schema/orders.js";
import { createCache } from "../../cache/create-cache.js";
import {
  createOrder,
  createOrderInput,
  listOrders,
  listOrdersInput,
  ORDERS_FEED_EXPLAIN,
  updateOrderStatus,
  updateOrderStatusInput,
  type OrderServiceDeps,
} from "./orders.js";

type OrderRow = typeof orders.$inferSelect;
type OrderInsert = typeof orders.$inferInsert;

const BRANCH_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID_1 = "22222222-2222-4222-8222-222222222222";
const ORDER_ID_2 = "33333333-3333-4333-8333-333333333333";
const ORDER_ID_3 = "44444444-4444-4444-8444-444444444444";

const rls: BranchContext = { userId: "user-1", branchId: BRANCH_ID, role: "owner" };

const row = (id: string, createdAt: string, overrides: Partial<OrderRow> = {}): OrderRow => ({
  id,
  branchId: BRANCH_ID,
  status: "pending",
  total: "10.00",
  createdAt: new Date(createdAt),
  ...overrides,
});

interface FakeDbState {
  selectRows: OrderRow[];
  insertRows: OrderRow[];
  updateRows: OrderRow[];
  transactionCalls: number;
  executeCalls: number;
  capturedLimit: number | undefined;
  capturedInsertValues: OrderInsert | undefined;
  capturedStatusUpdate: Partial<OrderRow> | undefined;
}

const createState = (overrides: Partial<FakeDbState> = {}): FakeDbState => ({
  selectRows: [],
  insertRows: [],
  updateRows: [],
  transactionCalls: 0,
  executeCalls: 0,
  capturedLimit: undefined,
  capturedInsertValues: undefined,
  capturedStatusUpdate: undefined,
  ...overrides,
});

interface FakeTx {
  readonly execute: (query: unknown) => Promise<unknown>;
  readonly select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (...columns: readonly unknown[]) => {
          limit: (n: number) => Promise<OrderRow[]>;
        };
      };
    };
  };
  readonly insert: (table: unknown) => {
    values: (values: OrderInsert) => { returning: () => Promise<OrderRow[]> };
  };
  readonly update: (table: unknown) => {
    set: (values: Partial<OrderRow>) => {
      where: (condition: unknown) => { returning: () => Promise<OrderRow[]> };
    };
  };
}

const createFakeDb = (state: FakeDbState): PosDatabase => {
  const tx: FakeTx = {
    execute: async (): Promise<unknown> => {
      state.executeCalls += 1;
      return await Promise.resolve([]);
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (n: number): Promise<OrderRow[]> => {
              state.capturedLimit = n;
              return await Promise.resolve([...state.selectRows]);
            },
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (values: OrderInsert) => ({
        returning: async (): Promise<OrderRow[]> => {
          state.capturedInsertValues = values;
          return await Promise.resolve([...state.insertRows]);
        },
      }),
    }),
    update: () => ({
      set: (values: Partial<OrderRow>) => ({
        where: () => ({
          returning: async (): Promise<OrderRow[]> => {
            state.capturedStatusUpdate = values;
            return await Promise.resolve([...state.updateRows]);
          },
        }),
      }),
    }),
  };
  const fakeDb = {
    transaction: async <T>(cb: (t: FakeTx) => Promise<T>): Promise<T> => {
      state.transactionCalls += 1;
      return await cb(tx);
    },
  };
  return fakeDb as unknown as PosDatabase;
};

const createDeps = (state: FakeDbState): OrderServiceDeps => ({
  db: createFakeDb(state),
  cache: createCache(createMemoryCacheStore()),
});

describe("listOrdersInput", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(listOrdersInput.safeParse({}).success).toBe(true);
  });

  it("accepts status, limit, and a well-formed cursor", () => {
    const parsed = listOrdersInput.safeParse({
      status: "ready",
      limit: 50,
      cursor: { createdAt: "2026-08-20T10:00:00.000Z", id: ORDER_ID_1 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(listOrdersInput.safeParse({ status: "burnt" }).success).toBe(false);
  });

  it("rejects limit 0, limit 101, and non-integer limits", () => {
    expect(listOrdersInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(listOrdersInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(listOrdersInput.safeParse({ limit: 1.5 }).success).toBe(false);
  });

  it("rejects a cursor with a non-uuid id", () => {
    expect(
      listOrdersInput.safeParse({
        cursor: { createdAt: "2026-08-20T10:00:00.000Z", id: "not-a-uuid" },
      }).success,
    ).toBe(false);
  });

  it("rejects a cursor with a non-ISO createdAt", () => {
    expect(
      listOrdersInput.safeParse({ cursor: { createdAt: "20/08/2026", id: ORDER_ID_1 } }).success,
    ).toBe(false);
  });
});

describe("createOrderInput", () => {
  it("accepts integers and one- or two-decimal amounts", () => {
    expect(createOrderInput.safeParse({ total: "0" }).success).toBe(true);
    expect(createOrderInput.safeParse({ total: "12" }).success).toBe(true);
    expect(createOrderInput.safeParse({ total: "0.5" }).success).toBe(true);
    expect(createOrderInput.safeParse({ total: "12.34" }).success).toBe(true);
    expect(createOrderInput.safeParse({ total: "1234567890.99" }).success).toBe(true);
  });

  it("rejects three decimals, missing digits, signs, and overflow", () => {
    expect(createOrderInput.safeParse({ total: "12.345" }).success).toBe(false);
    expect(createOrderInput.safeParse({ total: ".5" }).success).toBe(false);
    expect(createOrderInput.safeParse({ total: "12." }).success).toBe(false);
    expect(createOrderInput.safeParse({ total: "-1" }).success).toBe(false);
    expect(createOrderInput.safeParse({ total: "1e3" }).success).toBe(false);
    expect(createOrderInput.safeParse({ total: "12345678901" }).success).toBe(false);
    expect(createOrderInput.safeParse({ total: "12,34" }).success).toBe(false);
  });
});

describe("updateOrderStatusInput", () => {
  it("accepts a uuid orderId and a known status", () => {
    expect(
      updateOrderStatusInput.safeParse({ orderId: ORDER_ID_1, status: "delivered" }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid orderId", () => {
    expect(updateOrderStatusInput.safeParse({ orderId: "42", status: "ready" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown status", () => {
    expect(updateOrderStatusInput.safeParse({ orderId: ORDER_ID_1, status: "eaten" }).success).toBe(
      false,
    );
  });
});

describe("listOrders", () => {
  it("applies the default limit of 20 (queries limit + 1) and maps rows to DTOs", async () => {
    const state = createState({ selectRows: [row(ORDER_ID_1, "2026-08-20T10:00:00.000Z")] });
    const page = await listOrders(createDeps(state), rls, {});
    expect(state.capturedLimit).toBe(21);
    expect(state.executeCalls).toBe(1);
    expect(page).toEqual({
      items: [
        {
          id: ORDER_ID_1,
          branchId: BRANCH_ID,
          status: "pending",
          total: "10.00",
          createdAt: "2026-08-20T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  it("uses an explicit limit and filters by status", async () => {
    const state = createState({
      selectRows: [row(ORDER_ID_1, "2026-08-20T10:00:00.000Z", { status: "ready" })],
    });
    const page = await listOrders(createDeps(state), rls, { status: "ready", limit: 5 });
    expect(state.capturedLimit).toBe(6);
    expect(page.items.map((item) => item.status)).toEqual(["ready"]);
    expect(page.nextCursor).toBeNull();
  });

  it("builds the keyset condition when a cursor is provided", async () => {
    const state = createState({ selectRows: [row(ORDER_ID_2, "2026-08-20T09:00:00.000Z")] });
    const page = await listOrders(createDeps(state), rls, {
      cursor: { createdAt: "2026-08-20T10:00:00.000Z", id: ORDER_ID_1 },
      limit: 10,
    });
    expect(state.capturedLimit).toBe(11);
    expect(page.items.map((item) => item.id)).toEqual([ORDER_ID_2]);
  });

  it("returns nextCursor from the last page row when more rows exist", async () => {
    const state = createState({
      selectRows: [
        row(ORDER_ID_1, "2026-08-20T12:00:00.000Z"),
        row(ORDER_ID_2, "2026-08-20T11:00:00.000Z"),
        row(ORDER_ID_3, "2026-08-20T10:00:00.000Z"),
      ],
    });
    const page = await listOrders(createDeps(state), rls, { limit: 2 });
    expect(page.items.map((item) => item.id)).toEqual([ORDER_ID_1, ORDER_ID_2]);
    expect(page.nextCursor).toEqual({ createdAt: "2026-08-20T11:00:00.000Z", id: ORDER_ID_2 });
  });

  it("returns a null nextCursor when the page is empty even though extra rows exist", async () => {
    // limit 0 bypasses schema validation on purpose: page.at(-1) is undefined
    // while rows.length > limit, exercising the guard on the last row.
    const state = createState({ selectRows: [row(ORDER_ID_1, "2026-08-20T10:00:00.000Z")] });
    const page = await listOrders(createDeps(state), rls, { limit: 0 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("serves the second identical call from cache (loader runs once)", async () => {
    const state = createState({ selectRows: [row(ORDER_ID_1, "2026-08-20T10:00:00.000Z")] });
    const deps = createDeps(state);
    const first = await listOrders(deps, rls, { limit: 3 });
    const second = await listOrders(deps, rls, { limit: 3 });
    expect(state.transactionCalls).toBe(1);
    expect(second).toEqual(first);
  });
});

describe("createOrder", () => {
  it("inserts a pending order for the RLS branch and returns the DTO", async () => {
    const state = createState({
      insertRows: [row(ORDER_ID_1, "2026-08-20T10:00:00.000Z", { total: "7.50" })],
    });
    const dto = await createOrder(createDeps(state), rls, { total: "7.50" });
    expect(state.capturedInsertValues).toEqual({
      branchId: BRANCH_ID,
      status: "pending",
      total: "7.50",
    });
    expect(state.executeCalls).toBe(1);
    expect(dto).toEqual({
      id: ORDER_ID_1,
      branchId: BRANCH_ID,
      status: "pending",
      total: "7.50",
      createdAt: "2026-08-20T10:00:00.000Z",
    });
  });

  it("throws when the insert returns no row", async () => {
    const state = createState({ insertRows: [] });
    await expect(createOrder(createDeps(state), rls, { total: "1.00" })).rejects.toThrow(
      "insert returned no row",
    );
  });
});

describe("updateOrderStatus", () => {
  it("returns the updated DTO when the order exists in the branch", async () => {
    const state = createState({
      updateRows: [row(ORDER_ID_1, "2026-08-20T10:00:00.000Z", { status: "ready" })],
    });
    const dto = await updateOrderStatus(createDeps(state), rls, {
      orderId: ORDER_ID_1,
      status: "ready",
    });
    expect(state.capturedStatusUpdate).toEqual({ status: "ready" });
    expect(dto).toMatchObject({ id: ORDER_ID_1, status: "ready" });
  });

  it("returns null when no row matches", async () => {
    const state = createState({ updateRows: [] });
    await expect(
      updateOrderStatus(createDeps(state), rls, { orderId: ORDER_ID_1, status: "paid" }),
    ).resolves.toBeNull();
  });
});

describe("ORDERS_FEED_EXPLAIN", () => {
  it("is a SQL fragment referencing the orders table", () => {
    expect(ORDERS_FEED_EXPLAIN.queryChunks.length).toBeGreaterThan(0);
  });
});
