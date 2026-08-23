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
const publishedEntries = (): { subpath: string; entry: ConditionalExport }[] => {
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")) as {
    exports: Record<string, ConditionalExport | string>;
  };
  return Object.entries(pkg.exports)
    .filter((pair): pair is [string, ConditionalExport] => typeof pair[1] === "object")
    .map(([subpath, entry]) => ({ subpath, entry }));
};

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
 */
const GUARD_EXEMPT = new Set([...PILL_EXEMPT, "./adapters/cache-memory"]);

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

  it("every public entry except ./ports, ./env and ./adapters/cache-memory resolves to the browser guard", () => {
    const guarded = publishedEntries().filter(({ subpath }) => !GUARD_EXEMPT.has(subpath));
    expect(guarded.length).toBeGreaterThan(0);

    for (const { subpath, entry } of guarded) {
      expect(entry.browser, `${subpath} has no browser condition`).toBe(BROWSER_GUARD);
    }
  });

  it("the exempt entries carry no browser condition (the exemption is deliberate, not accidental)", () => {
    for (const { subpath, entry } of publishedEntries()) {
      if (!GUARD_EXEMPT.has(subpath)) continue;
      expect(entry.browser, `${subpath} is documented as unguarded`).toBeUndefined();
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
