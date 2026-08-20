import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readManifest } from "../utils/manifest.js";
import { ROUTER_MARKERS } from "../templates/plan.js";
import { runInit } from "./init.js";
import { runAdd, spliceRouters } from "./add.js";

const makeApp = async (srcDir = false): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
  await mkdir(path.join(cwd, ...(srcDir ? ["src", "app"] : ["app"])), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
  // Start WITHOUT features so `add` does the wiring.
  await runInit({ cwd, dryRun: false, force: true, version: "0.0.0", features: [] });
  return cwd;
};

const OPTIONS = { dryRun: false, force: true };

describe("spliceRouters", () => {
  it("fills both marker blocks (core always on) and preserves custom code", () => {
    const source = [
      "// custom header",
      ROUTER_MARKERS.importsOpen,
      ROUTER_MARKERS.importsClose,
      'import { myRouter } from "./mine";',
      "",
      ROUTER_MARKERS.routersOpen,
      `  ${ROUTER_MARKERS.routersClose}`,
      "  mine: myRouter,",
    ].join("\n");
    const spliced = spliceRouters(source, ["orders"]);
    expect(spliced).toContain(
      'import { healthRouter, ordersRouter } from "@nukesai-pos/backend/trpc";',
    );
    expect(spliced).toContain("  orders: ordersRouter,");
    expect(spliced).toContain("// custom header");
    expect(spliced).toContain('import { myRouter } from "./mine";');
    expect(spliced).toContain("  mine: myRouter,");
  });

  it("keeps the core router when the last feature is removed", () => {
    const spliced = spliceRouters(
      [
        ROUTER_MARKERS.importsOpen,
        ROUTER_MARKERS.importsClose,
        ROUTER_MARKERS.routersOpen,
        `  ${ROUTER_MARKERS.routersClose}`,
      ].join("\n"),
      [],
    );
    expect(spliced).toContain('import { healthRouter } from "@nukesai-pos/backend/trpc";');
    expect(spliced).not.toContain("ordersRouter");
  });

  it("throws a restorable error when a marker is missing", () => {
    expect(() => spliceRouters("export const appRouter = 1;", ["orders"])).toThrow(
      /missing the .* marker/,
    );
  });
});

describe("runAdd", () => {
  it("materializes the extension file on first use and wires the feature", async () => {
    const cwd = await makeApp();
    // Default scaffold: NO server dir — the route consumes posCoreRouter.
    expect(existsSync(path.join(cwd, "server"))).toBe(false);

    const report = await runAdd(["orders"], { cwd, ...OPTIONS });
    expect(report.added).toEqual(["orders"]);
    expect(existsSync(path.join(cwd, "server/routers/orders.ts"))).toBe(false);

    const after = await readFile(path.join(cwd, "server/routers/_app.ts"), "utf8");
    expect(after).toContain(
      'import { healthRouter, ordersRouter } from "@nukesai-pos/backend/trpc";',
    );
    expect(after).toContain("orders: ordersRouter,");
    const manifest = await readManifest(cwd);
    expect(manifest?.features).toEqual(["orders"]);
    expect(manifest?.files).toContain("server/routers/_app.ts");
  });

  it("splices an EXISTING extension file, preserving custom procedures", async () => {
    const cwd = await makeApp();
    const registry = {
      orders: { name: "orders", routerExport: "ordersRouter" },
      kds: { name: "kds", routerExport: "kdsRouter" },
    };
    await runAdd(["orders"], { cwd, ...OPTIONS }, registry);
    const appPath = path.join(cwd, "server/routers/_app.ts");
    await writeFile(
      appPath,
      (await readFile(appPath, "utf8")).replace(
        "export type AppRouter",
        "const mine = 1;\nvoid mine;\nexport type AppRouter",
      ),
    );
    // A dry-run over the existing file changes nothing on disk.
    await runAdd(["kds"], { cwd, dryRun: true, force: true }, registry);
    expect(await readFile(appPath, "utf8")).not.toContain("kdsRouter");
    // The real run splices the new feature in and keeps the custom line.
    await runAdd(["kds"], { cwd, ...OPTIONS }, registry);
    const after = await readFile(appPath, "utf8");
    expect(after).toContain("kds: kdsRouter,");
    expect(after).toContain("const mine = 1;");
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
  });

  it("requires an initialised app", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-none-"));
    await expect(runAdd(["orders"], { cwd, ...OPTIONS })).rejects.toThrow("No nukes-pos.json");
  });

  it("dry-run reports without writing (and alone satisfies the worktree gate)", async () => {
    const cwd = await makeApp();
    const report = await runAdd(["orders"], { cwd, dryRun: true, force: false });
    expect(report.added).toEqual(["orders"]);
    expect((await readManifest(cwd))?.features).toEqual([]);
    expect(existsSync(path.join(cwd, "server/routers/_app.ts"))).toBe(false);
  });

  it("creates the extension under src/ when the scaffold lives there", async () => {
    const cwd = await makeApp(true);
    const report = await runAdd(["orders"], { cwd, ...OPTIONS });
    expect(report.added).toEqual(["orders"]);
    expect(await readFile(path.join(cwd, "src/server/routers/_app.ts"), "utf8")).toContain(
      "orders: ordersRouter,",
    );
  });
});
