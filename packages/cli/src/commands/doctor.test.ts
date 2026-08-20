import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createManifest, writeManifest } from "../utils/manifest.js";
import { runDoctor } from "./doctor.js";

const makeApp = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {}\n");
  await mkdir(path.join(cwd, "app"), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }');
  return cwd;
};

const healthyNpmrc = "@nukesai-pos:registry=https://registry.npmjs.org/\n";

describe("runDoctor", () => {
  it("reports a healthy installation with no errors", async () => {
    const cwd = await makeApp();
    await writeManifest(cwd, createManifest("0.0.0"));
    await writeFile(path.join(cwd, ".npmrc"), healthyNpmrc);
    expect(await runDoctor({ cwd })).toEqual({ errors: [], warnings: [] });
  });

  it("surfaces detection failures as errors", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-"));
    await writeFile(path.join(cwd, "package.json"), "{}");
    const report = await runDoctor({ cwd });
    expect(report.errors.some((error) => error.includes("No next.config"))).toBe(true);
  });

  it("errors on a missing manifest and missing .npmrc", async () => {
    const cwd = await makeApp();
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual([
      "No nukes-pos.json manifest. Run `nukes-pos init` first.",
      ".npmrc is missing — @nukesai-pos packages will fail to install.",
    ]);
  });

  it("errors when .npmrc lacks the scope registry", async () => {
    const cwd = await makeApp();
    await writeManifest(cwd, createManifest("0.0.0"));
    await writeFile(path.join(cwd, ".npmrc"), "save-exact=true\n");
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual([".npmrc has no @nukesai-pos registry entry."]);
  });

  it("warns on JS-only apps and a missing next dependency", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-"));
    await writeFile(path.join(cwd, "next.config.mjs"), "export default {}\n");
    await mkdir(path.join(cwd, "app"), { recursive: true });
    await writeFile(path.join(cwd, "package.json"), "{}");
    await writeManifest(cwd, createManifest("0.0.0"));
    await writeFile(path.join(cwd, ".npmrc"), healthyNpmrc);
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      "No tsconfig.json found — Nukes POS templates are TypeScript-first.",
      '"next" is not in dependencies of package.json.',
    ]);
  });
});
