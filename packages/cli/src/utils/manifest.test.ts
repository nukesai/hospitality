import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createManifest, MANIFEST_NAME, readManifest, writeManifest } from "./manifest.js";

const makeDir = async (): Promise<string> => mkdtemp(path.join(tmpdir(), "nukes-cli-manifest-"));

describe("manifest", () => {
  it("returns null when no manifest exists", async () => {
    expect(await readManifest(await makeDir())).toBeNull();
  });

  it("round-trips a manifest", async () => {
    const cwd = await makeDir();
    const manifest = createManifest("1.2.3");
    await writeManifest(cwd, manifest);
    expect(await readManifest(cwd)).toEqual(manifest);
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.features).toEqual([]);
    expect(manifest.files).toEqual([]);
  });

  it("returns null on malformed JSON instead of crashing", async () => {
    const cwd = await makeDir();
    await writeFile(path.join(cwd, MANIFEST_NAME), "{ not json");
    expect(await readManifest(cwd)).toBeNull();
  });
});
