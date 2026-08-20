export const POS_RESOURCES = [
  "orders",
  "orderItems",
  "tables",
  "reservations",
  "products",
  "payments",
  "reports",
  "settings",
  "staff",
] as const;
export type PosResource = (typeof POS_RESOURCES)[number];

export const POS_ACTIONS = ["read", "create", "update", "delete"] as const;
export type PosAction = (typeof POS_ACTIONS)[number];

export const POS_ROLES = [
  "owner",
  "admin",
  "kitchen",
  "bartender",
  "waiter",
  "receptionist",
  "courier",
] as const;
export type PosRole = (typeof POS_ROLES)[number];

export type PermissionMatrix = Readonly<
  Record<PosRole, Readonly<Partial<Record<PosResource, readonly PosAction[]>>>>
>;

const ALL: readonly PosAction[] = ["read", "create", "update", "delete"];
const RCU: readonly PosAction[] = ["read", "create", "update"];
const RU: readonly PosAction[] = ["read", "update"];
const R: readonly PosAction[] = ["read"];

/** SINGLE SOURCE OF TRUTH. better-auth AC (backend) and RLS role gates both derive from this. */
export const PERMISSION_MATRIX: PermissionMatrix = {
  owner: {
    orders: ALL,
    orderItems: ALL,
    tables: ALL,
    reservations: ALL,
    products: ALL,
    payments: ALL,
    reports: R,
    settings: ALL,
    staff: ALL,
  },
  admin: {
    orders: ALL,
    orderItems: ALL,
    tables: ALL,
    reservations: ALL,
    products: ALL,
    payments: ALL,
    reports: R,
    settings: RU,
    staff: RCU,
  },
  kitchen: { orders: RU, orderItems: RU, products: R },
  bartender: { orders: RCU, orderItems: RCU, tables: R, products: R, payments: RCU },
  waiter: {
    orders: RCU,
    orderItems: RCU,
    tables: RU,
    reservations: RCU,
    products: R,
    payments: RCU,
  },
  receptionist: { orders: R, tables: RU, reservations: ALL, payments: RCU },
  courier: { orders: RU, orderItems: R },
} as const;

/** Pure check usable in tRPC middleware, UI gating, and RLS doc tests. */
export function can(role: PosRole, resource: PosResource, action: PosAction): boolean {
  return (PERMISSION_MATRIX[role][resource] ?? []).includes(action);
}
