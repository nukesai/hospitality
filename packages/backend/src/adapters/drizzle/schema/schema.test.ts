import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { branchGuard, posApp, roleIn } from "./_policies.js";
import {
  account,
  branch,
  branchInvitation,
  branchMember,
  rateLimit,
  session,
  user,
  verification,
} from "./auth.js";
import { orderInsertSchema, orderSelectSchema, orders } from "./orders.js";

const dialect = new PgDialect();
const sqlText = (fragment: Parameters<PgDialect["sqlToQuery"]>[0]): string =>
  dialect.sqlToQuery(fragment).sql;

describe("_policies", () => {
  it("branchGuard emits the fail-closed InitPlan fragment", () => {
    const text = sqlText(branchGuard(orders.branchId));
    expect(text).toContain("nullif(current_setting('app.branch_id', true), '')::uuid");
    expect(text).toContain("(select");
  });

  it("roleIn inlines quoted literals (DDL cannot carry bind params)", () => {
    const text = sqlText(roleIn(["owner", "admin"]));
    expect(text).toContain("in ('owner', 'admin')");
    expect(text).toContain("current_setting('app.role', true)");
  });

  it("roleIn rejects unsafe role names", () => {
    expect(() => roleIn(["owner'; drop table orders;--"])).toThrow(/Invalid role name/);
  });

  it("posApp is the existing pos_app role (drizzle-kit must not manage it)", () => {
    expect(posApp.name).toBe("pos_app");
  });
});

describe("orders schema", () => {
  const config = getTableConfig(orders);

  it("enables RLS with four policies gated to pos_app", () => {
    expect(config.enableRLS).toBe(true);
    const policies = Object.fromEntries(config.policies.map((p) => [p.name, p]));
    expect(Object.keys(policies).sort()).toEqual([
      "orders_delete",
      "orders_insert",
      "orders_select",
      "orders_update",
    ]);
    expect(policies.orders_delete?.for).toBe("delete");
    const deleteSql = sqlText(policies.orders_delete?.using!);
    expect(deleteSql).toContain("in ('owner', 'admin')");
  });

  it("branch_id leads the feed index (keyset pagination shape)", () => {
    const index = config.indexes.find((i) => i.config.name === "orders_branch_created_id_idx");
    expect(index).toBeDefined();
    const first = index?.config.columns[0] as { name?: string } | undefined;
    expect(first?.name).toBe("branch_id");
  });

  it("references the branch table (FK closure executes)", () => {
    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0]?.reference();
    expect(fk?.foreignTable).toBe(branch);
  });

  it("drizzle-zod DTOs validate rows", () => {
    expect(
      orderInsertSchema.safeParse({ branchId: "not-a-uuid", status: "pending", total: "1.00" })
        .success,
    ).toBe(false);
    expect(
      orderSelectSchema.safeParse({
        id: "0d34ec7f-467e-4e50-808c-d6512123a4f5",
        branchId: "0d34ec7f-467e-4e50-808c-d6512123a4f5",
        status: "pending",
        total: "1.00",
        createdAt: new Date(),
      }).success,
    ).toBe(true);
  });
});

describe("auth schema (better-auth org->branch remap)", () => {
  it("every table resolves its config (defaults, FKs and indexes execute)", () => {
    for (const table of [
      user,
      session,
      account,
      verification,
      branch,
      branchMember,
      branchInvitation,
      rateLimit,
    ]) {
      const config = getTableConfig(table);
      expect(config.columns.length).toBeGreaterThan(0);
      for (const fk of config.foreignKeys) expect(fk.reference().foreignTable).toBeDefined();
    }
  });

  it("branchMember/branchInvitation carry branch_id (the remap contract)", () => {
    expect(getTableConfig(branchMember).columns.some((c) => c.name === "branch_id")).toBe(true);
    expect(getTableConfig(branchInvitation).columns.some((c) => c.name === "branch_id")).toBe(true);
    expect(getTableConfig(session).columns.some((c) => c.name === "active_organization_id")).toBe(
      true,
    );
  });

  it("account enforces the (issuer, account_id) uniqueness better-auth expects", () => {
    const config = getTableConfig(account);
    const unique = config.indexes.find((i) => i.config.name === "account_issuer_accountId_uidx");
    expect(unique?.config.unique).toBe(true);
  });
});
