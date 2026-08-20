import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createManifest, readManifest, writeManifest } from "../utils/manifest.js";
import { KNOWN_FEATURES, runAdd } from "./add.js";

const makeInitialised = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-"));
  await writeManifest(cwd, createManifest("0.0.0"));
  return cwd;
};

const OPTIONS = { dryRun: false };

describe("runAdd", () => {
  it("requires an initialised app", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-add-"));
    await expect(runAdd(["reports"], { cwd, ...OPTIONS })).rejects.toThrow(
      /Run `nukes-pos init` first/,
    );
  });

  it("reports unknown features without touching the manifest", async () => {
    const cwd = await makeInitialised();
    const report = await runAdd(["reports"], { cwd, ...OPTIONS });
    expect(report).toEqual({ added: [], alreadyPresent: [], unknown: ["reports"] });
    expect(await readManifest(cwd)).toMatchObject({ features: [] });
  });

  it("adds known features and persists them", async () => {
    const cwd = await makeInitialised();
    const report = await runAdd(["reports"], { cwd, ...OPTIONS }, ["reports", "kds"]);
    expect(report).toEqual({ added: ["reports"], alreadyPresent: [], unknown: [] });
    expect(await readManifest(cwd)).toMatchObject({ features: ["reports"] });
  });

  it("dedupes features that are already installed", async () => {
    const cwd = await makeInitialised();
    await runAdd(["reports"], { cwd, ...OPTIONS }, ["reports"]);
    const report = await runAdd(["reports"], { cwd, ...OPTIONS }, ["reports"]);
    expect(report).toEqual({ added: [], alreadyPresent: ["reports"], unknown: [] });
  });

  it("dry-run computes the plan without persisting", async () => {
    const cwd = await makeInitialised();
    const report = await runAdd(["kds"], { cwd, dryRun: true }, ["kds"]);
    expect(report.added).toEqual(["kds"]);
    expect(await readManifest(cwd)).toMatchObject({ features: [] });
  });

  it("ships with an intentionally empty registry in the foundation release", () => {
    expect(KNOWN_FEATURES).toEqual([]);
  });
});
