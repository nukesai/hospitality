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

type DomainStatements = Record<PosResource, readonly PosAction[]>;
export type PosStatements = typeof defaultStatements & DomainStatements;

const domain: DomainStatements = Object.fromEntries(
  POS_RESOURCES.map((r) => [r, POS_ACTIONS]),
) as unknown as DomainStatements;

export const ac: AccessControl<PosStatements> = createAccessControl({
  ...defaultStatements,
  ...domain,
});

export type PosRoleDefinition = Role<Statements, PosStatements>;

const grantsFor = (name: PosRole): Partial<Record<PosResource, PosAction[]>> => {
  const grants: Partial<Record<PosResource, PosAction[]>> = {};
  for (const res of POS_RESOURCES) {
    const acts = PERMISSION_MATRIX[name][res];
    if (acts !== undefined) grants[res] = [...acts];
  }
  return grants;
};

/**
 * better-auth role objects derived from the ONE matrix in common (R8).
 * owner/admin merge the plugin's built-in org statements so built-in endpoints
 * (invite, remove member, ...) stay permission-checked.
 */
export const posRoles: Record<PosRole, PosRoleDefinition> = Object.fromEntries(
  POS_ROLES.map((name) => {
    const base = name === "owner" ? ownerAc.statements : name === "admin" ? adminAc.statements : {};
    return [name, ac.newRole({ ...base, ...grantsFor(name) } as unknown as PosStatements)];
  }),
) as unknown as Record<PosRole, PosRoleDefinition>;

export function isPosRole(value: string): value is PosRole {
  return (POS_ROLES as readonly string[]).includes(value);
}
