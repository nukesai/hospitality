import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readManifest } from "../utils/manifest.js";
import { ROUTER_MARKERS, type PosFeatureTemplate } from "../templates/plan.js";
import { runInit } from "./init.js";
import { runAdd, spliceRouters } from "./add.js";

const makeApp = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
  await mkdir(path.join(cwd, "app"), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
  // Start WITHOUT features so `add` does the materializing.
  await runInit({ cwd, dryRun: false, force: true, version: "0.0.0", features: [] });
  return cwd;
};

const OPTIONS = { dryRun: false, force: true };

const KDS: PosFeatureTemplate = {
  name: "kds",
  routerFile: "server/routers/kds.ts",
  routerExport: "kdsRouter",
  body: "export const kdsRouter = 1;\n",
};

describe("spliceRouters", () => {
  it("fills both marker blocks and preserves everything outside them", () => {
    const source = [
      "// custom header",
      ROUTER_MARKERS.importsOpen,
      ROUTER_MARKERS.importsClose,
      'import { myRouter } from "./mine";',
      "",
      `  ${ROUTER_MARKERS.routersOpen}`.trimStart(),
      `  ${ROUTER_MARKERS.routersClose}`,
      "  mine: myRouter,",
    ].join("\n");
    const spliced = spliceRouters(source, [KDS]);
    expect(spliced).toContain('import { kdsRouter } from "./kds";');
    expect(spliced).toContain("  kds: kdsRouter,");
    expect(spliced).toContain("// custom header");
    expect(spliced).toContain('import { myRouter } from "./mine";');
    expect(spliced).toContain("  mine: myRouter,");
  });

  it("renders empty blocks when the last feature is removed", () => {
    const source = [
      ROUTER_MARKERS.importsOpen,
      'import { kdsRouter } from "./kds";',
      ROUTER_MARKERS.importsClose,
      `  ${ROUTER_MARKERS.routersOpen}`.trimStart(),
      "  kds: kdsRouter,",
      `  ${ROUTER_MARKERS.routersClose}`,
    ].join("\n");
    const spliced = spliceRouters(source, []);
    expect(spliced).not.toContain("kdsRouter");
  });

  it("throws a restorable error when a marker is missing", () => {
    expect(() => spliceRouters("export const appRouter = 1;", [KDS])).toThrow(
      /missing the .* marker/,
    );
  });
});

describe("runAdd", () => {
  it("materializes the feature router and splices _app.ts from the registry", async () => {
    const cwd = await makeApp();
    const before = await readFile(path.join(cwd, "server/routers/_app.ts"), "utf8");
    expect(before).not.toContain("ordersRouter");

    const report = await runAdd(["orders"], { cwd, ...OPTIONS });
    expect(report.added).toEqual(["orders"]);
    expect(report.conflicted).toEqual([]);
    expect(existsSync(path.join(cwd, "server/routers/orders.ts"))).toBe(true);

    const after = await readFile(path.join(cwd, "server/routers/_app.ts"), "utf8");
    expect(after).toContain('import { ordersRouter } from "./orders";');
    expect(after).toContain("orders: ordersRouter,");

    const manifest = await readManifest(cwd);
    expect(manifest?.features).toEqual(["orders"]);
    expect(manifest?.files).toContain("server/routers/orders.ts");
  });

  it("dedupes features that are already installed", async () => {
    const cwd = await makeApp();
    await runAdd(["orders"], { cwd, ...OPTIONS });
    const report = await runAdd(["orders"], { cwd, ...OPTIONS });
    expect(report.added).toEqual([]);
    expect(report.alreadyPresent).toEqual(["orders"]);
  });

  it("rejects unknown features without touching anything", async () => {
    const cwd = await makeApp();
    const report = await runAdd(["nope"], { cwd, ...OPTIONS });
    expect(report.unknown).toEqual(["nope"]);
    expect(existsSync(path.join(cwd, "server/routers/nope.ts"))).toBe(false);
  });

  it("requires an initialised app", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-none-"));
    await expect(runAdd(["orders"], { cwd, ...OPTIONS })).rejects.toThrow("No nukes-pos.json");
  });

  it("dry-run reports without writing (and alone satisfies the worktree gate)", async () => {
    const cwd = await makeApp();
    const report = await runAdd(["orders"], { cwd, dryRun: true, force: false });
    expect(report.added).toEqual(["orders"]);
    expect(existsSync(path.join(cwd, "server/routers/orders.ts"))).toBe(false);
    expect((await readManifest(cwd))?.features).toEqual([]);
  });

  it("supports custom registries (kds fixture)", async () => {
    const cwd = await makeApp();
    const report = await runAdd(["kds"], { cwd, ...OPTIONS }, { kds: KDS });
    expect(report.added).toEqual(["kds"]);
    expect(await readFile(path.join(cwd, "server/routers/kds.ts"), "utf8")).toContain("kdsRouter");
  });

  it("reports a conflict when the feature file is already user-owned", async () => {
    const cwd = await makeApp();
    await mkdir(path.join(cwd, "server", "routers"), { recursive: true });
    await writeFile(path.join(cwd, "server/routers/orders.ts"), "// mine\n");
    const report = await runAdd(["orders"], { cwd, ...OPTIONS });
    expect(report.conflicted).toEqual(["server/routers/orders.ts"]);
    expect(await readFile(path.join(cwd, "server/routers/orders.ts"), "utf8")).toBe("// mine\n");
    expect(existsSync(path.join(cwd, "server/routers/orders.ts.new"))).toBe(true);
  });

  it("places feature files under src/ when the scaffold lives there", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-src-"));
    await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
    await mkdir(path.join(cwd, "src", "app"), { recursive: true });
    await writeFile(path.join(cwd, "tsconfig.json"), "{}");
    await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
    await runInit({ cwd, dryRun: false, force: true, version: "0.0.0", features: [] });
    const report = await runAdd(["orders"], { cwd, ...OPTIONS });
    expect(report.added).toEqual(["orders"]);
    expect(existsSync(path.join(cwd, "src/server/routers/orders.ts"))).toBe(true);
  });
});
