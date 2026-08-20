import type { PosMessageKey } from "@nukesai-pos/common/i18n/locales/en";

/**
 * next-intl reserves "." for nesting — "Namespace keys cannot contain the
 * character '.'" (docs, verified 2026-08-21) — while the common catalog (the
 * single source of truth, consumed by backend's dependency-free translator)
 * is deliberately FLAT with dotted keys. This module is the one bridge:
 * a pure, loss-less flat→nested transform. Key STRINGS never change — call
 * sites and wire error keys keep using the same dotted paths, next-intl just
 * resolves them as paths over the nested tree.
 */
export interface NestedMessages {
  readonly [segment: string]: string | NestedMessages;
}

type Nest<K extends string, V> = K extends `${infer Head}.${infer Rest}`
  ? { readonly [P in Head]: Nest<Rest, V> }
  : { readonly [P in K]: V };
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;
type DeepSimplify<T> = T extends object ? { [K in keyof T]: DeepSimplify<T[K]> } & {} : T;

/** The exact nested shape of the common catalog, derived from `PosMessageKey`. */
export type PosNestedMessages = DeepSimplify<UnionToIntersection<Nest<PosMessageKey, string>>>;

/** Every POS locale ships the pos catalog under this top-level namespace so it
 *  can never collide with the consumer app's own messages. */
export const POS_NAMESPACE = "pos";

/** `{ pos: <nested catalog> }` — the shape merged into the app's messages. */
export interface PosMessages {
  readonly pos: PosNestedMessages;
}

/**
 * Flat dotted catalog → nested tree. Throws on prefix collisions ("a.b" leaf
 * next to "a.b.c") because one silently overwriting the other would drop
 * translations — the catalog type makes this impossible today; the guard keeps
 * it impossible for consumer-supplied catalogs.
 */
export const nestPosMessages = (flat: Readonly<Record<string, string>>): NestedMessages => {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(".");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const existing = (node[part] ??= {});
      if (typeof existing === "string") {
        throw new Error(`Catalog key "${key}" nests under an existing leaf — rename one of them.`);
      }
      node = existing as Record<string, unknown>;
    }
    const leaf = String(parts.at(-1)); // split(".") never yields an empty array
    if (typeof node[leaf] === "object") {
      throw new Error(`Catalog key "${key}" is a leaf but already exists as a branch.`);
    }
    node[leaf] = value;
  }
  return root as NestedMessages;
};

/** Inverse of nestPosMessages — used by tests to prove the round-trip is loss-less. */
export const flattenPosMessages = (nested: NestedMessages, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [segment, value] of Object.entries(nested)) {
    const path = prefix === "" ? segment : `${prefix}.${segment}`;
    if (typeof value === "string") {
      out[path] = value;
    } else {
      Object.assign(out, flattenPosMessages(value, path));
    }
  }
  return out;
};
