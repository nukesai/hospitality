import "server-only";

import type pg from "pg";

import type { PosEnvSource } from "../env.js";
import { createNukesPos, type CreateNukesPosOptions, type NukesPos } from "./create-pos.js";

/**
 * THE app-edge singleton. The ONE place in the package allowed to touch the
 * ambient environment (AGENTS.md §7 names this file as the sanctioned
 * exception): `createNukesPos` itself stays pure — consumers who need full
 * control keep calling it directly; everyone else gets a one-liner:
 *
 *   import { getPos } from "@nukesai-pos/backend/bootstrap";
 *   const pos = await getPos();
 *
 * - Cached on globalThis: `next dev` re-evaluates modules per save; a plain
 *   module-scope cache would leak one pg.Pool per reload.
 * - On Vercel (VERCEL=1) the @vercel/functions hooks (pool suspension +
 *   waitUntil for SWR refreshes) are wired automatically when the OPTIONAL
 *   peer is installed — and silently skipped when it is not.
 */
export interface GetPosOptions extends Omit<CreateNukesPosOptions, "env"> {
  /** Defaults to process.env — this module IS the ambient edge. */
  readonly env?: PosEnvSource;
}

interface VercelFunctions {
  readonly attachDatabasePool?: (pool: pg.Pool) => void;
  readonly waitUntil?: (promise: Promise<unknown>) => void;
}

type PosGlobal = typeof globalThis & {
  __nukesPos?: Promise<NukesPos>;
  /** Wall-clock ms until which a failed boot is NOT retried. */
  __nukesPosRetryAfter?: number;
};

/**
 * How long a failed boot is remembered. Long enough that a flapping database
 * cannot turn every inbound request into a fresh pool + auth init (each boot
 * opens connections to the node that is already struggling), short enough that
 * recovery is a few seconds, not a redeploy.
 */
const FAILED_BOOT_COOLDOWN_MS = 1_000;

const boot = async (options: GetPosOptions): Promise<NukesPos> => {
  // The singleton is the DOCUMENTED ambient edge (AGENTS.md §7); every other
  // module receives env as a parameter.
  const env = options.env ?? process.env;

  let vercel: VercelFunctions = {};
  if (env.VERCEL === "1") {
    try {
      vercel = await import("@vercel/functions");
    } catch {
      // Optional peer not installed — Fluid-compute hooks simply stay off.
    }
  }

  return createNukesPos({
    ...options,
    env,
    onPoolCreated: options.onPoolCreated ?? vercel.attachDatabasePool,
    waitUntil: options.waitUntil ?? vercel.waitUntil,
  });
};

/** Boot (once) and return the shared NukesPos instance. */
// NOT async on purpose: every caller must receive the SAME promise identity.
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function getPos(options: GetPosOptions = {}): Promise<NukesPos> {
  const g = globalThis as PosGlobal;
  if (g.__nukesPos === undefined) {
    const pending = boot(options);
    g.__nukesPos = pending;
    // A FAILED boot must not be cached forever: the database being briefly
    // unreachable at cold start would otherwise poison every later request for
    // the life of the process. It must not be forgotten INSTANTLY either, or a
    // sustained outage turns every request into a fresh boot. So: forget it
    // after a cooldown, and only if it is still the current one. The attached
    // handler also keeps the rejection "handled" for callers that never await.
    void pending.catch(() => {
      if (g.__nukesPos !== pending) return;
      g.__nukesPosRetryAfter = Date.now() + FAILED_BOOT_COOLDOWN_MS;
    });
  } else if (g.__nukesPosRetryAfter !== undefined && Date.now() >= g.__nukesPosRetryAfter) {
    delete g.__nukesPos;
    delete g.__nukesPosRetryAfter;
    return getPos(options);
  }
  return g.__nukesPos;
}

/** Tear down the singleton (tests, workers): shutdown + forget. */
export async function disposePos(): Promise<void> {
  const g = globalThis as PosGlobal;
  const pending = g.__nukesPos;
  delete g.__nukesPos;
  delete g.__nukesPosRetryAfter;
  if (pending !== undefined) {
    const pos = await pending.catch(() => null);
    if (pos !== null) await pos.shutdown();
  }
}
