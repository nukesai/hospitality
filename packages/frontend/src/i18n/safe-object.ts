/**
 * Prototype-safe primitives for building message trees out of UNTRUSTED input.
 *
 * Catalogs routinely arrive as JSON from a TMS/CMS, where `__proto__` is an
 * ordinary own key after `JSON.parse`. Plain `node[key] = value` would then run
 * the `Object.prototype.__proto__` setter (or worse, `node[part] ??= {}` would
 * hand back `Object.prototype` itself and every later write would land on it,
 * process-wide). Reading with `Object.hasOwn` and writing with
 * `defineProperty` keeps such keys ordinary data properties: loss-less for the
 * catalog, inert for the prototype chain.
 */
export const ownValue = (node: Readonly<Record<string, unknown>>, key: string): unknown =>
  Object.hasOwn(node, key) ? node[key] : undefined;

export const defineOwn = (node: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(node, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};
