/**
 * Deep-merge for message trees — later sources win per LEAF key, so a consumer
 * can override a single translation without restating the catalog:
 *
 *   mergePosMessages(pos, app, { pos: { order: { total: "Sum: {amount}" } } })
 */
export type MessageTree = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeTwo = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...a };
  for (const key of Object.keys(b)) {
    const bv = b[key];
    const av = out[key];
    out[key] = isRecord(av) && isRecord(bv) ? mergeTwo(av, bv) : bv;
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
