import { can, POS_ACTIONS, POS_RESOURCES, POS_ROLES } from "@nukesai-pos/common/auth";
import { describe, expect, it } from "vitest";

import { posClientAc, posClientRoles } from "./roles.js";

describe("client AC derivation (mirror of backend, locked to the common matrix)", () => {
  it("authorize() agrees with can() for every role x resource x action", () => {
    for (const role of POS_ROLES) {
      for (const resource of POS_RESOURCES) {
        for (const action of POS_ACTIONS) {
          const result = posClientRoles[role].authorize({ [resource]: [action] });
          expect(result.success, `${role} ${resource} ${action}`).toBe(can(role, resource, action));
        }
      }
    }
  });

  it("exposes every POS resource in the access-control statements", () => {
    for (const resource of POS_RESOURCES) {
      expect(Object.keys(posClientAc.statements)).toContain(resource);
    }
  });
});
