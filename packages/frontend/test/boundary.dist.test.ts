import { readFileSync } from "node:fs";
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
const isBarrel = (f: string): boolean => path.basename(f) === "index.js";

const NODE_BUILTIN =
  /\bfrom\s*["'](?:node:|fs["']|path["']|crypto["']|child_process["']|os["']|net["']|tls["'])/;
const USE_CLIENT = /^\s*["']use client["'];/m;
const SERVER_ONLY = /import\s*["']server-only["']/;

describe("frontend dist boundary contract", () => {
  it('every client leaf chunk keeps its "use client" directive', async () => {
    const leaves = (await files("client/**/*.js")).filter((f) => !isBarrel(f));
    // Guards against the glob silently matching nothing (vacuous pass).
    expect(leaves.length).toBeGreaterThan(0);
    for (const file of leaves) {
      expect(read(file), `${file} lost its "use client" directive during bundling`).toMatch(
        USE_CLIENT,
      );
    }
  });

  it('no barrel carries "use client" (it would leak unused exports to the client bundle)', async () => {
    const barrels = (await files("**/*.js")).filter(isBarrel);
    expect(barrels.length).toBeGreaterThan(0);
    for (const file of barrels) {
      expect(read(file), `FORBIDDEN "use client" on barrel: ${file}`).not.toMatch(USE_CLIENT);
    }
  });

  it("no client chunk imports server-only or a node builtin", async () => {
    for (const file of await files("client/**/*.js")) {
      const src = read(file);
      expect(src, `${file} imports server-only`).not.toMatch(SERVER_ONLY);
      expect(src, `${file} imports a node builtin`).not.toMatch(NODE_BUILTIN);
    }
  });

  it('no server chunk is marked "use client", and the server entry keeps its poison pill', async () => {
    const serverFiles = await files("server/**/*.js");
    expect(serverFiles.length).toBeGreaterThan(0);
    for (const file of serverFiles) {
      expect(read(file), `${file} is wrongly marked as a client module`).not.toMatch(USE_CLIENT);
    }
    expect(read("server/index.js"), 'server/index.js lost import "server-only"').toMatch(
      SERVER_ONLY,
    );
  });
});
