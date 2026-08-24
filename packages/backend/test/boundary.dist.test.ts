import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PKG_ROOT = path.join(import.meta.dirname, "..");
const DIST = path.join(PKG_ROOT, "dist");

const files = async (pattern: string): Promise<string[]> => {
  const matched: string[] = [];
  for await (const file of glob(pattern, { cwd: DIST })) matched.push(file);
  return matched.sort();
};
const read = (f: string): string => readFileSync(path.join(DIST, f), "utf8");

const USE_CLIENT = /^\s*["']use client["'];/m;
const SERVER_ONLY = /import\s*["']server-only["']/;

const BROWSER_GUARD = "./dist/internal/browser-guard.js";

interface ConditionalExport {
  readonly types?: string;
  readonly browser?: string;
  readonly default?: string;
}

/**
 * The published surface, read from the package's OWN exports map.
 *
 * Derived, never hard-coded: this test previously iterated a literal
 * ["index.js", "adapters/demo/index.js"] and so enforced the contract on 2 of
 * 12 entries while the other ten silently lost their locks. isolation.md:2-4 is
 * explicit — "if a rule is not enforced, it is not a rule" — and a hard-coded
 * list stops enforcing the moment someone adds a subpath.
 */
const rawExports = (): Record<string, ConditionalExport | string> =>
  (
    JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")) as {
      exports: Record<string, ConditionalExport | string>;
    }
  ).exports;

/**
 * `./package.json` is the one legitimate string-valued export. Any OTHER
 * shorthand entry (`"./foo": "./dist/foo.js"`) would carry neither lock and
 * would be silently skipped by a `typeof === "object"` filter, so it is
 * rejected outright rather than filtered away.
 */
const SHORTHAND_ALLOWED = new Set(["./package.json"]);

const publishedEntries = (): { subpath: string; entry: ConditionalExport }[] =>
  Object.entries(rawExports())
    .filter((pair): pair is [string, ConditionalExport] => typeof pair[1] === "object")
    .map(([subpath, entry]) => ({ subpath, entry }));

/** dist-relative path of a subpath's real module (the `default` condition). */
const distTarget = (entry: ConditionalExport): string =>
  path.relative(DIST, path.join(PKG_ROOT, entry.default ?? ""));

/**
 * ./ports is type-only (isolation.md:41) and ./env is imported by scripts
 * (RESEARCH-BACKEND.md:177-178) — the two documented pill exemptions.
 */
const PILL_EXEMPT = new Set(["./ports", "./env"]);

/**
 * ./adapters/cache-memory is isomorphic-safe, so it needs no browser guard
 * (RESEARCH-BACKEND.md:180-181). It still carries the pill.
 *
 * ./ports and ./env are deliberately NOT here: they are exempt from the pill
 * only. The browser condition costs them nothing — Node scripts and the
 * react-server graph both resolve `default` — and without it they were the only
 * entries carrying no lock at all.
 */
const GUARD_EXEMPT = new Set(["./adapters/cache-memory"]);

describe("backend dist boundary contract", () => {
  it("emits the browser guard, its types, and the guard throws", () => {
    expect(existsSync(path.join(DIST, "internal/browser-guard.js"))).toBe(true);
    expect(existsSync(path.join(DIST, "index.d.ts"))).toBe(true);
    expect(read("internal/browser-guard.js")).toContain("server-only and cannot be imported");
  });

  it("derives a non-empty entry set, and every exemption names a real subpath", () => {
    const entries = publishedEntries();
    // Guards against a rename or a parse change silently emptying the set —
    // a vacuous pass here would hide the exact class of drift this test exists
    // to catch (isolation.md:139).
    expect(entries.length).toBeGreaterThan(0);

    const subpaths = new Set(entries.map((e) => e.subpath));
    for (const exempt of new Set([...PILL_EXEMPT, ...GUARD_EXEMPT])) {
      expect(subpaths, `exemption "${exempt}" no longer matches any export`).toContain(exempt);
    }

    // Every entry must resolve to a real built file, or the assertions below
    // would silently skip it.
    for (const { subpath, entry } of entries) {
      expect(entry.default, `${subpath} has no default condition`).toBeDefined();
      expect(
        existsSync(path.join(DIST, distTarget(entry))),
        `${subpath} -> ${String(entry.default)} was not built`,
      ).toBe(true);
    }
  });

  it("every public entry except ./ports and ./env keeps its server-only poison pill", () => {
    const guarded = publishedEntries().filter(({ subpath }) => !PILL_EXEMPT.has(subpath));
    expect(guarded.length).toBeGreaterThan(0);

    for (const { subpath, entry } of guarded) {
      const file = distTarget(entry);
      expect(read(file), `${subpath} (${file}) lost its import "server-only"`).toMatch(SERVER_ONLY);
    }
  });

  it("no subpath is declared in shorthand string form (it would carry neither lock)", () => {
    for (const [subpath, entry] of Object.entries(rawExports())) {
      if (SHORTHAND_ALLOWED.has(subpath)) continue;
      expect(
        typeof entry,
        `${subpath} is a shorthand string export, so it can carry no browser condition and is invisible to the lock assertions — declare it as { types, browser, default }`,
      ).toBe("object");
    }
  });

  it("every public entry except ./ports, ./env and ./adapters/cache-memory resolves to the browser guard", () => {
    const guarded = publishedEntries().filter(({ subpath }) => !GUARD_EXEMPT.has(subpath));
    expect(guarded.length).toBeGreaterThan(0);

    for (const { subpath, entry } of guarded) {
      expect(entry.browser, `${subpath} has no browser condition`).toBe(BROWSER_GUARD);
      // Condition ORDER is load-bearing: Node and the bundlers take the first
      // matching key, so { types, default, browser } silently disables the guard
      // while every value-based assertion above still passes.
      const keys = Object.keys(entry);
      expect(
        keys.indexOf("browser"),
        `${subpath} lists "browser" after "default" (${keys.join(", ")}), so default wins in a browser graph and the guard never fires`,
      ).toBeLessThan(keys.indexOf("default"));
    }
  });

  it("the exempt entries carry no browser condition (the exemption is deliberate, not accidental)", () => {
    for (const { subpath, entry } of publishedEntries()) {
      if (!GUARD_EXEMPT.has(subpath)) continue;
      expect(entry.browser, `${subpath} is documented as unguarded`).toBeUndefined();
    }
  });

  it("sideEffects names every pill-bearing entry, so no bundler may elide the pill", () => {
    const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")) as {
      sideEffects?: string[];
    };
    const declared = new Set(pkg.sideEffects ?? []);
    expect(declared.size).toBeGreaterThan(0);

    // A pill's entire value IS its side effect. If the module is also declared
    // side-effect-free, a bundler is licensed to drop it when nothing is used
    // from it — the lock would be present in source and absent after bundling,
    // the same class of failure the rest of this file exists to catch.
    for (const { subpath, entry } of publishedEntries()) {
      const file = distTarget(entry);
      if (!SERVER_ONLY.test(read(file))) continue;
      expect(
        declared,
        `${subpath} (${String(entry.default)}) carries the server-only pill but is not listed in sideEffects`,
      ).toContain(entry.default);
    }
  });

  it('no chunk is ever marked "use client"', async () => {
    const all = await files("**/*.js");
    expect(all.length).toBeGreaterThan(0);
    for (const file of all) {
      expect(read(file), `${file} is wrongly marked as a client module`).not.toMatch(USE_CLIENT);
    }
  });
});
