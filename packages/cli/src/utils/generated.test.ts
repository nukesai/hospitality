import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeGenerated } from "./generated.js";
import { stamp } from "./stamp.js";

const makeDir = async (): Promise<string> => mkdtemp(path.join(tmpdir(), "nukes-cli-gen-"));

describe("writeGenerated", () => {
  it("creates missing files (with parent dirs) stamped", async () => {
    const cwd = await makeDir();
    const result = await writeGenerated(cwd, "deep/nested/file.ts", "body\n", false);
    expect(result.outcome).toBe("created");
    expect(await readFile(path.join(cwd, "deep/nested/file.ts"), "utf8")).toBe(stamp("body\n"));
  });

  it("skips identical files and updates stale pristine ones", async () => {
    const cwd = await makeDir();
    await writeGenerated(cwd, "a.ts", "body\n", false);
    expect((await writeGenerated(cwd, "a.ts", "body\n", false)).outcome).toBe("skipped");
    expect((await writeGenerated(cwd, "a.ts", "new body\n", false)).outcome).toBe("updated");
    expect(await readFile(path.join(cwd, "a.ts"), "utf8")).toBe(stamp("new body\n"));
  });

  it("writes .new beside modified or unstamped files", async () => {
    const cwd = await makeDir();
    await writeFile(path.join(cwd, "user.ts"), "// user owned\n");
    const result = await writeGenerated(cwd, "user.ts", "template\n", false);
    expect(result.outcome).toBe("conflicted");
    expect(await readFile(path.join(cwd, "user.ts"), "utf8")).toBe("// user owned\n");
    expect(await readFile(path.join(cwd, "user.ts.new"), "utf8")).toBe(stamp("template\n"));
  });

  it("dry-run reports without touching the filesystem", async () => {
    const cwd = await makeDir();
    expect((await writeGenerated(cwd, "x.ts", "b\n", true)).outcome).toBe("created");
    expect(existsSync(path.join(cwd, "x.ts"))).toBe(false);
    await writeFile(path.join(cwd, "y.ts"), "// mine\n");
    expect((await writeGenerated(cwd, "y.ts", "b\n", true)).outcome).toBe("conflicted");
    expect(existsSync(path.join(cwd, "y.ts.new"))).toBe(false);
  });
});
