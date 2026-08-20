import { sql, type SQL } from "drizzle-orm";
import { pgRole, type PgRole } from "drizzle-orm/pg-core";

/** Created by initdb / 0000_bootstrap-roles.sql; .existing() keeps drizzle-kit off it. */
export const posApp: PgRole = pgRole("pos_app").existing();

/**
 * Fail-closed branch predicate — reused by EVERY policy.
 * nullif handles BOTH unset (NULL) and post-transaction '' residue on pooled
 * connections (bare ::uuid on '' throws 22P02 — live-verified). The (select ...)
 * wrap hoists the call into a one-shot InitPlan (~3x; the real cliff —
 * subqueries/joins in USING — is banned).
 */
export const branchGuard = (col: unknown): SQL =>
  sql`${col} = (select nullif(current_setting('app.branch_id', true), '')::uuid)`;

/**
 * Role gate fragment for privileged policies (e.g. DELETE to owner/admin only).
 * MUST inline literals: CREATE POLICY is DDL and cannot carry bind parameters —
 * a parameterized fragment generates `in ($1, $2)` and fails 42P02 at migrate
 * time (reproduced live). Role names come from the closed POS_ROLES list; the
 * regex guard makes injection impossible even on programmer error.
 */
export const roleIn = (roles: readonly string[]): SQL => {
  for (const role of roles) {
    if (!/^[a-z_]+$/.test(role)) throw new Error(`Invalid role name for policy: ${role}`);
  }
  return sql.raw(
    `(select nullif(current_setting('app.role', true), '')) in (${roles
      .map((r) => `'${r}'`)
      .join(", ")})`,
  );
};
