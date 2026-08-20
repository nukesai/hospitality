"use client";

import {
  PERMISSION_MATRIX,
  POS_ACTIONS,
  POS_RESOURCES,
  POS_ROLES,
  type PosAction,
  type PosResource,
  type PosRole,
} from "@nukesai-pos/common/auth";
import { createAccessControl } from "better-auth/plugins/access";
import type { AccessControl, Role, Statements } from "better-auth/plugins/access";
import { adminAc, defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

/**
 * Client-side mirror of backend/src/auth/roles.ts, derived from the SAME
 * matrix in common (frontend may not import backend — R8). A table-driven test
 * in each package locks the two derivations together.
 */
type DomainStatements = Record<PosResource, readonly PosAction[]>;
export type PosClientStatements = typeof defaultStatements & DomainStatements;

const domain: DomainStatements = Object.fromEntries(
  POS_RESOURCES.map((r) => [r, POS_ACTIONS]),
) as unknown as DomainStatements;

export const posClientAc: AccessControl<PosClientStatements> = createAccessControl({
  ...defaultStatements,
  ...domain,
});

export type PosClientRoleDefinition = Role<Statements, PosClientStatements>;

const grantsFor = (name: PosRole): Partial<Record<PosResource, PosAction[]>> => {
  const grants: Partial<Record<PosResource, PosAction[]>> = {};
  for (const res of POS_RESOURCES) {
    const acts = PERMISSION_MATRIX[name][res];
    if (acts !== undefined) grants[res] = [...acts];
  }
  return grants;
};

export const posClientRoles: Record<PosRole, PosClientRoleDefinition> = Object.fromEntries(
  POS_ROLES.map((name) => {
    const base = name === "owner" ? ownerAc.statements : name === "admin" ? adminAc.statements : {};
    return [
      name,
      posClientAc.newRole({ ...base, ...grantsFor(name) } as unknown as PosClientStatements),
    ];
  }),
) as unknown as Record<PosRole, PosClientRoleDefinition>;
