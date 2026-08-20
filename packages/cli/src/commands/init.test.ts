import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readManifest } from "../utils/manifest.js";
import { runInit } from "./init.js";

const makeApp = async (srcDir = false): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-init-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {}\n");
  await mkdir(path.join(cwd, ...(srcDir ? ["src", "app"] : ["app"])), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }');
  return cwd;
};

const OPTIONS = { dryRun: false, force: true, version: "0.0.0" };

describe("runInit", () => {
  it("scaffolds manifest, npmrc and the route group", async () => {
    const cwd = await makeApp();
    const report = await runInit({ cwd, ...OPTIONS });

    expect(report.created).toEqual(["nukes-pos.json", ".npmrc", path.join("app", "(nukes-pos)")]);
    expect(report.skipped).toEqual([]);
    expect(await readManifest(cwd)).toMatchObject({ version: "0.0.0" });
    expect(await readFile(path.join(cwd, ".npmrc"), "utf8")).toContain("@nukesai-pos:registry=");
    expect(existsSync(path.join(cwd, "app", "(nukes-pos)", ".gitkeep"))).toBe(true);
  });

  it("is idempotent: a second run skips everything", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.created).toEqual([]);
    expect(report.skipped).toEqual(["nukes-pos.json", ".npmrc", path.join("app", "(nukes-pos)")]);
  });

  it("appends the scope to an existing unrelated .npmrc", async () => {
    const cwd = await makeApp();
    await writeFile(path.join(cwd, ".npmrc"), "save-exact=true\n");
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.created).toContain(".npmrc");
    const npmrc = await readFile(path.join(cwd, ".npmrc"), "utf8");
    expect(npmrc).toContain("save-exact=true");
    expect(npmrc).toContain("@nukesai-pos:registry=");
  });

  it("scaffolds into src/app when the host uses a src directory", async () => {
    const cwd = await makeApp(true);
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.created).toContain(path.join("src", "app", "(nukes-pos)"));
  });

  it("dry-run plans without writing (and skips the git check)", async () => {
    const cwd = await makeApp();
    const report = await runInit({ cwd, dryRun: true, force: false, version: "0.0.0" });
    expect(report.created).toEqual(["nukes-pos.json", ".npmrc", path.join("app", "(nukes-pos)")]);
    expect(await readManifest(cwd)).toBeNull();
    expect(existsSync(path.join(cwd, ".npmrc"))).toBe(false);
    expect(existsSync(path.join(cwd, "app", "(nukes-pos)"))).toBe(false);
  });

  it("dry-run reports an existing-but-unscoped .npmrc without touching it", async () => {
    const cwd = await makeApp();
    await writeFile(path.join(cwd, ".npmrc"), "save-exact=true\n");
    const report = await runInit({ cwd, dryRun: true, force: false, version: "0.0.0" });
    expect(report.created).toContain(".npmrc");
    expect(await readFile(path.join(cwd, ".npmrc"), "utf8")).toBe("save-exact=true\n");
  });

  it("refuses a non-repo worktree when not forced", async () => {
    const cwd = await makeApp();
    await expect(runInit({ cwd, dryRun: false, force: false, version: "0.0.0" })).rejects.toThrow(
      /Not a git repository/,
    );
  });
});
