import "server-only";

import { createNukesPos, type NukesPos } from "@nukesai-pos/backend/bootstrap";
import { attachDatabasePool, waitUntil } from "@vercel/functions";

const g = globalThis as typeof globalThis & { __nukesPos?: Promise<NukesPos> };

export async function getPos(): Promise<NukesPos> {
  // next dev re-evaluates modules per save; without this cache each reload leaks a Pool.
  g.__nukesPos ??= createNukesPos({
    env: process.env, // the ONLY process.env handoff
    onPoolCreated: process.env.VERCEL === "1" ? attachDatabasePool : undefined,
    waitUntil: process.env.VERCEL === "1" ? waitUntil : undefined,
  });
  return g.__nukesPos;
}
