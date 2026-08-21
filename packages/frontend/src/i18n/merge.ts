import { defineOwn, ownValue } from "./safe-object.js";

/**
 * Deep-merge for message trees — later sources win per LEAF key, so a consumer
 * can override a single translation without restating the catalog:
 *
 *   mergePosMessages(pos, app, { pos: { order: { total: "Sum: {amount}" } } })
 */
export type MessageTree = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Spread COPIES own keys (never runs a setter), so the seed is safe; the
// per-key write must go through defineOwn or a `__proto__` key in a
// consumer/vendor catalog would reassign the merged tree's prototype instead.
const mergeTwo = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...a };
  for (const key of Object.keys(b)) {
    const bv = ownValue(b, key);
    const av = ownValue(out, key);
    defineOwn(out, key, isRecord(av) && isRecord(bv) ? mergeTwo(av, bv) : bv);
  }
  return out;
};

export const mergePosMessages = (...sources: readonly (object | undefined)[]): MessageTree => {
  let out: Record<string, unknown> = {};
  for (const source of sources) {
    if (source !== undefined) out = mergeTwo(out, source as Record<string, unknown>);
  }
  return out;
};
