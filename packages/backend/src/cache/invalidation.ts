import { AppError } from "@nukesai-pos/common/errors";
import type { LocationId } from "@nukesai-pos/common/types";

import { buildCacheTag, type CachePort } from "../ports/cache.js";
import type { CacheEntity, PosTrpcMeta } from "../trpc/init.js";

/**
 * The invalidation DISCIPLINE, enforced mechanically:
 * every mutation must declare what it invalidates (or "none", explicitly).
 * The consumer's base-procedure middleware calls enforceCacheMeta before next()
 * and applyCacheInvalidation after a SUCCESSFUL mutation. Invalidation failure
 * propagates (fail closed) — a missed invalidation serves wrong data.
 */
export function enforceCacheMeta(
  meta: PosTrpcMeta | undefined,
  type: "query" | "mutation" | "subscription",
  path: string,
): void {
  if (type !== "mutation") return;
  if (meta?.cacheInvalidates === undefined) {
    throw new AppError("INTERNAL", {
      internalMessage: `Mutation "${path}" does not declare meta.cacheInvalidates (use "none" to opt out explicitly)`,
    });
  }
}

export async function applyCacheInvalidation(
  cache: CachePort,
  branchId: string,
  meta: PosTrpcMeta | undefined,
): Promise<void> {
  const declared = meta?.cacheInvalidates;
  if (declared === undefined || declared === "none" || declared.length === 0) return;
  const tags = declared.map((entity: CacheEntity) => buildCacheTag(branchId as LocationId, entity));
  await cache.invalidateTags(tags);
}
