import { can, type PosAction, type PosResource, type PosRole } from "@nukesai-pos/common/auth";

import { isPosRole } from "../auth/roles.js";
import { AppError } from "@nukesai-pos/common/errors";

import type { BranchContext } from "../adapters/drizzle/rls.js";
import type { PosTrpcContext, PosSessionInfo } from "./init.js";

/**
 * Guard functions — the WHOLE authorization logic, exported as plain async
 * functions so it is 100%-covered in this package. The consumer scaffold wires
 * each into `t.middleware()` in one line (R1: routers/`t` live in the app).
 * Guards throw AppError; the scaffold's error formatter maps them to tRPC codes.
 */

export interface AuthedContext {
  readonly session: PosSessionInfo;
}

export function requireSession(ctx: PosTrpcContext): AuthedContext {
  if (ctx.session === null) {
    throw new AppError("UNAUTHENTICATED", { context: { requestId: ctx.requestId } });
  }
  return { session: ctx.session };
}

export interface PermissionCheck {
  readonly resource: PosResource;
  readonly action: PosAction;
}

export interface BranchAuthorization {
  readonly rls: BranchContext & { readonly role: PosRole };
}

/**
 * 401 no session -> 403 no active branch -> 403 when x-branch-id disagrees with
 * the server-truth active branch (R7) -> membership + role -> optional fast-path
 * permission check against the common matrix. Returns the RLS context that
 * withBranchContext SET LOCALs — derived ONLY from the session, never from input.
 */
export async function requireBranch(
  ctx: PosTrpcContext,
  check?: PermissionCheck,
): Promise<BranchAuthorization> {
  const { session } = requireSession(ctx);
  const branchId = session.activeBranchId;
  if (branchId === null) {
    throw new AppError("BRANCH_ACCESS_DENIED", {
      internalMessage: "No active branch on session",
      context: { requestId: ctx.requestId, userId: session.userId },
    });
  }
  if (ctx.requestedBranchId !== null && ctx.requestedBranchId !== branchId) {
    throw new AppError("BRANCH_ACCESS_DENIED", {
      internalMessage: "x-branch-id does not match the active branch — switch branch first",
      context: { requestId: ctx.requestId, userId: session.userId, branchId },
    });
  }
  // better-auth types getActiveMember as non-null, but it RETURNS null when the
  // caller is not a member (runtime-verified) — widen before checking.
  const member = (await ctx.deps.auth.api.getActiveMember({
    headers: ctx.requestHeaders,
  })) as { role: string } | null;
  if (member === null || !isPosRole(member.role)) {
    throw new AppError("BRANCH_ACCESS_DENIED", {
      internalMessage: "Caller is not a member of the active branch",
      context: { requestId: ctx.requestId, userId: session.userId, branchId },
    });
  }
  if (check !== undefined && !can(member.role, check.resource, check.action)) {
    throw new AppError("ROLE_FORBIDDEN", {
      internalMessage: `${member.role} lacks ${check.action} on ${check.resource}`,
      context: { requestId: ctx.requestId, userId: session.userId, branchId },
    });
  }
  return { rls: { userId: session.userId, branchId, role: member.role } };
}

export function requireRole(
  authorization: BranchAuthorization,
  roles: readonly PosRole[],
  requestId: string,
): void {
  if (!roles.includes(authorization.rls.role)) {
    throw new AppError("ROLE_FORBIDDEN", {
      internalMessage: `Role ${authorization.rls.role} not in [${roles.join(", ")}]`,
      context: { requestId },
    });
  }
}

export interface RateLimitOptions {
  readonly bucket: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Fixed-window rate limit over KvPort. The KV is ALWAYS present — Redis when
 * configured, otherwise an in-process store — so this no longer fails open.
 * It used to return early whenever no KV was configured, which meant the
 * default `CACHE_DRIVER=memory` left every tRPC route unlimited.
 *
 * Without Redis the window is per-process, so N instances allow about N x the
 * limit. Bounded and documented, rather than absent. Key: userId over ip over
 * "anon".
 */
export async function checkRateLimit(
  ctx: PosTrpcContext,
  path: string,
  options: RateLimitOptions,
): Promise<void> {
  const subject = ctx.session?.userId ?? ctx.ip ?? "anon";
  const key = `rl:${options.bucket}:${path}:${subject}`;
  const count = await ctx.deps.kv.incrementWithTtl(key, options.windowSeconds);
  if (count > options.limit) {
    throw new AppError("RATE_LIMITED", {
      internalMessage: `${String(count)}/${String(options.limit)} in ${String(options.windowSeconds)}s for ${key}`,
      context: { requestId: ctx.requestId },
    });
  }
}
