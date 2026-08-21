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

type PosGlobal = typeof globalThis & { __nukesPos?: Promise<NukesPos> };

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
    // A FAILED boot must not be cached: the database being briefly unreachable
    // at cold start would otherwise poison every later request for the life of
    // the process. Forget it (only if it is still the current one) so the next
    // call retries; the attached handler also keeps the rejection "handled"
    // for callers that never await.
    void pending.catch(() => {
      if (g.__nukesPos === pending) delete g.__nukesPos;
    });
  }
  return g.__nukesPos;
}

/** Tear down the singleton (tests, workers): shutdown + forget. */
export async function disposePos(): Promise<void> {
  const g = globalThis as PosGlobal;
  const pending = g.__nukesPos;
  delete g.__nukesPos;
  if (pending !== undefined) {
    const pos = await pending.catch(() => null);
    if (pos !== null) await pos.shutdown();
  }
}
