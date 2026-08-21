import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readManifest } from "../utils/manifest.js";
import { stamp } from "../utils/stamp.js";
import { runInit } from "./init.js";
import { runUpgrade } from "./upgrade.js";

const makeApp = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-upgrade-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
  await mkdir(path.join(cwd, "app"), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
  await runInit({ cwd, dryRun: false, force: true, version: "0.0.0" });
  return cwd;
};

describe("runUpgrade", () => {
  it("refuses to rewrite files in a worktree it cannot review (no --force)", async () => {
    const cwd = await makeApp();
    await expect(runUpgrade({ cwd, dryRun: false, version: "0.1.0" })).rejects.toThrow(
      "Not a git repository",
    );
  });

  it("requires an initialised app", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-upgrade-none-"));
    await expect(runUpgrade({ cwd, dryRun: true, version: "0.1.0" })).rejects.toThrow(
      "No nukes-pos.json",
    );
  });

  it("rewrites stale pristine files, preserves edits, bumps the manifest", async () => {
    const cwd = await makeApp();
    // Simulate an older scaffold: one stale-but-pristine file, one hand edit.
    await writeFile(path.join(cwd, "instrumentation.ts"), stamp("// old template\n"));
    const edited = path.join(cwd, "i18n/request.ts");
    await writeFile(edited, `${await readFile(edited, "utf8")}// my tweak\n`);

    const report = await runUpgrade({ cwd, dryRun: false, force: true, version: "0.1.0" });
    expect(report.fromVersion).toBe("0.0.0");
    expect(report.toVersion).toBe("0.1.0");

    const byFile = Object.fromEntries(report.plan.map((entry) => [entry.file, entry.action]));
    expect(byFile["instrumentation.ts"]).toBe("updated");
    expect(byFile["i18n/request.ts"]).toBe("conflicted");
    expect(byFile["app/api/pos/[[...pos]]/route.ts"]).toBe("skipped");

    expect(await readFile(path.join(cwd, "instrumentation.ts"), "utf8")).toContain(
      "registerGlobalErrorHandlers",
    );
    expect(existsSync(`${edited}.new`)).toBe(true);
    expect(await readFile(edited, "utf8")).toContain("// my tweak");
    expect(await readManifest(cwd)).toMatchObject({ version: "0.1.0" });
  });

  it("preserves ledger entries the plan does not own (the add-created extension)", async () => {
    const cwd = await makeApp();
    const { runAdd } = await import("./add.js");
    await runAdd(
      ["kds"],
      { cwd, dryRun: false, force: true },
      { kds: { name: "kds", routerExport: "kdsRouter" } },
    );
    await runUpgrade({ cwd, dryRun: false, force: true, version: "0.1.0" });
    const manifest = await readManifest(cwd);
    expect(manifest?.files).toContain("server/routers/_app.ts");
  });

  it("dry-run plans without writing", async () => {
    const cwd = await makeApp();
    await writeFile(path.join(cwd, "instrumentation.ts"), stamp("// old template\n"));
    const report = await runUpgrade({ cwd, dryRun: true, version: "0.1.0" });
    const entry = report.plan.find((item) => item.file === "instrumentation.ts");
    expect(entry?.action).toBe("updated");
    expect(await readFile(path.join(cwd, "instrumentation.ts"), "utf8")).toBe(
      stamp("// old template\n"),
    );
    expect(await readManifest(cwd)).toMatchObject({ version: "0.0.0" });
  });
});
