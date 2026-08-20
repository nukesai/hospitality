import { describe, expect, it } from "vitest";

import { can, PERMISSION_MATRIX, POS_ACTIONS, POS_RESOURCES, POS_ROLES } from "./permissions.js";

describe("permission matrix", () => {
  it("covers every role", () => {
    for (const role of POS_ROLES) {
      expect(PERMISSION_MATRIX[role]).toBeDefined();
    }
  });

  it("grants owner full access to operational resources", () => {
    for (const resource of ["orders", "settings", "staff"] as const) {
      for (const action of POS_ACTIONS) {
        expect(can("owner", resource, action)).toBe(true);
      }
    }
  });

  it("reports are read-only for every role that has them", () => {
    for (const role of POS_ROLES) {
      expect(can(role, "reports", "create")).toBe(false);
      expect(can(role, "reports", "update")).toBe(false);
      expect(can(role, "reports", "delete")).toBe(false);
    }
  });

  it("kitchen cannot touch payments, settings or staff", () => {
    for (const resource of ["payments", "settings", "staff"] as const) {
      for (const action of POS_ACTIONS) {
        expect(can("kitchen", resource, action)).toBe(false);
      }
    }
  });

  it("only owner and admin can delete orders", () => {
    for (const role of POS_ROLES) {
      expect(can(role, "orders", "delete")).toBe(role === "owner" || role === "admin");
    }
  });

  it("waiter can create orders and reservations but not delete tables", () => {
    expect(can("waiter", "orders", "create")).toBe(true);
    expect(can("waiter", "reservations", "create")).toBe(true);
    expect(can("waiter", "tables", "delete")).toBe(false);
  });

  it("returns false for ungran-ted resources (undefined branch)", () => {
    expect(can("courier", "settings", "read")).toBe(false);
  });

  it("matrix only references known resources and actions", () => {
    for (const role of POS_ROLES) {
      for (const [resource, actions] of Object.entries(PERMISSION_MATRIX[role]) as [
        string,
        readonly string[],
      ][]) {
        expect(POS_RESOURCES).toContain(resource);
        for (const action of actions) expect(POS_ACTIONS).toContain(action);
      }
    }
  });
});
