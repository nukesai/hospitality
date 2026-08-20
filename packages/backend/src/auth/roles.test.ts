import {
  can,
  POS_ACTIONS,
  POS_RESOURCES,
  POS_ROLES,
  type PosAction,
  type PosResource,
} from "@nukesai-pos/common/auth";
import { describe, expect, it } from "vitest";

import { ac, isPosRole, posRoles } from "./roles.js";

describe("ac", () => {
  it("exposes every POS resource with the full action set", () => {
    for (const resource of POS_RESOURCES) {
      expect(ac.statements[resource]).toEqual(POS_ACTIONS);
    }
  });

  it("keeps the built-in organization statements", () => {
    expect(ac.statements.organization).toEqual(["update", "delete"]);
    expect(ac.statements.member).toEqual(["create", "update", "delete"]);
    expect(ac.statements.invitation).toEqual(["create", "cancel"]);
  });
});

describe("posRoles", () => {
  for (const role of POS_ROLES) {
    it(`authorize mirrors PERMISSION_MATRIX for ${role}`, () => {
      for (const resource of POS_RESOURCES) {
        for (const action of POS_ACTIONS) {
          const request: Partial<Record<PosResource, PosAction[]>> = {
            [resource]: [action],
          };
          const result = posRoles[role].authorize(request);
          expect(result.success, `${role} ${resource}:${action}`).toBe(can(role, resource, action));
        }
      }
    });
  }

  it("owner keeps the built-in owner org statements (update + delete)", () => {
    expect(posRoles.owner.authorize({ organization: ["update"] }).success).toBe(true);
    expect(posRoles.owner.authorize({ organization: ["delete"] }).success).toBe(true);
  });

  it("admin keeps the built-in admin org statements (update but not delete)", () => {
    expect(posRoles.admin.authorize({ organization: ["update"] }).success).toBe(true);
    expect(posRoles.admin.authorize({ organization: ["delete"] }).success).toBe(false);
  });

  it("non-management roles get no built-in org statements", () => {
    for (const role of POS_ROLES) {
      if (role === "owner" || role === "admin") continue;
      expect(posRoles[role].authorize({ organization: ["update"] }).success, role).toBe(false);
    }
  });
});

describe("isPosRole", () => {
  it("accepts every known role", () => {
    for (const role of POS_ROLES) {
      expect(isPosRole(role)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isPosRole("superuser")).toBe(false);
    expect(isPosRole("")).toBe(false);
    expect(isPosRole("Owner")).toBe(false);
  });
});
