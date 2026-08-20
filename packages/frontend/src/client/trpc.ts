"use client";

import type { AnyTRPCRouter } from "@trpc/server";
import { httpBatchStreamLink, type TRPCLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

export interface PosTrpcLinkConfig {
  /** e.g. `${origin}/api/trpc` — consumer-provided, zero hardcoded values. */
  readonly url: string;
  /** Extra headers per request (bearer token, x-branch-id, ...). */
  readonly headers?: (() => Record<string, string> | Promise<Record<string, string>>) | undefined;
}

/** superjson matches the scaffold's initTRPC transformer; streaming batches. */
export function createPosTrpcLinks<TRouter extends AnyTRPCRouter>(
  config: PosTrpcLinkConfig,
): TRPCLink<TRouter>[] {
  const options = {
    url: config.url,
    transformer: superjson,
    ...(config.headers !== undefined ? { headers: config.headers } : {}),
  };
  // The transformer flag is a type-level property of the CONSUMER's AppRouter;
  // over the AnyTRPCRouter generic it cannot be proven statically. The scaffold
  // pairs this with `transformer: superjson` on initTRPC — asserted, not inferred.
  return [
    httpBatchStreamLink(options as unknown as Parameters<typeof httpBatchStreamLink<TRouter>>[0]),
  ];
}

export function createPosQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data comes from OUR Redis-backed cache layer; the client cache only
        // smooths navigation. Never let it mask invalidation.
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * MUST be called on sign-out (and on branch switch if stale cross-branch data
 * is unacceptable): the browser singleton otherwise serves one account's cached
 * queries to the next account on the same device (review-caught).
 */
export function resetPosQueryClient(): void {
  browserQueryClient?.clear();
  browserQueryClient = undefined;
}

/**
 * SSR-safe accessor: a fresh client per server render (no cross-request
 * leakage), a singleton in the browser (no state loss on re-render).
 */
export function getPosQueryClient(): QueryClient {
  if (typeof window === "undefined") return createPosQueryClient();
  browserQueryClient ??= createPosQueryClient();
  return browserQueryClient;
}
