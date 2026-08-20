import { existsSync, readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIST = path.join(import.meta.dirname, "..", "dist");

const files = async (pattern: string): Promise<string[]> => {
  const matched: string[] = [];
  for await (const file of glob(pattern, { cwd: DIST })) matched.push(file);
  return matched.sort();
};
const read = (f: string): string => readFileSync(path.join(DIST, f), "utf8");

const USE_CLIENT = /^\s*["']use client["'];/m;
const SERVER_ONLY = /import\s*["']server-only["']/;

describe("backend dist boundary contract", () => {
  it("emits the browser guard, its types, and the guard throws", () => {
    expect(existsSync(path.join(DIST, "internal/browser-guard.js"))).toBe(true);
    expect(existsSync(path.join(DIST, "index.d.ts"))).toBe(true);
    expect(read("internal/browser-guard.js")).toContain("server-only and cannot be imported");
  });

  it("guarded entries keep their server-only poison pill", () => {
    for (const file of ["index.js", "adapters/demo/index.js"]) {
      expect(read(file), `${file} lost its import "server-only"`).toMatch(SERVER_ONLY);
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
