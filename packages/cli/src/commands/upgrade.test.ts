import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createManifest, writeManifest } from "../utils/manifest.js";
import { stamp } from "../utils/stamp.js";
import { runUpgrade } from "./upgrade.js";

const OPTIONS = { dryRun: true };

describe("runUpgrade", () => {
  it("requires an initialised app", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-upgrade-"));
    await expect(runUpgrade({ cwd, ...OPTIONS })).rejects.toThrow(/Run `nukes-pos init` first/);
  });

  it("classifies every tracked file into a plan", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-upgrade-"));
    const pristineBody = "export const ok = true;\n";
    await writeFile(path.join(cwd, "pristine.ts"), stamp(pristineBody));
    await writeFile(path.join(cwd, "edited.ts"), stamp(pristineBody).replace("true", "false"));
    await writeFile(path.join(cwd, "unstamped.ts"), pristineBody);
    await writeManifest(cwd, {
      ...createManifest("0.0.0"),
      files: ["pristine.ts", "edited.ts", "unstamped.ts", "gone.ts"],
    });

    const report = await runUpgrade({ cwd, ...OPTIONS });
    expect(report.fromVersion).toBe("0.0.0");
    expect(report.plan).toEqual([
      { file: "pristine.ts", action: "regenerate" },
      { file: "edited.ts", action: "preserve-and-diff" },
      { file: "unstamped.ts", action: "unstamped" },
      { file: "gone.ts", action: "missing" },
    ]);
  });
});
