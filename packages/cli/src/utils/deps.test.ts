import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { injectConsumerDependencies } from "./deps.js";

const makeApp = async (pkg: object): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-deps-"));
  await writeFile(path.join(cwd, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  return cwd;
};

describe("injectConsumerDependencies", () => {
  it("adds the scoped packages at the CLI version plus catalog pins, sorted", async () => {
    const cwd = await makeApp({ dependencies: { next: "16.3.1" } });
    const report = await injectConsumerDependencies(cwd, "1.2.3", false);
    expect(report.added).toContain("@nukesai-pos/backend");
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@nukesai-pos/common"]).toBe("^1.2.3");
    expect(Object.keys(pkg.dependencies)).toEqual([...Object.keys(pkg.dependencies)].sort());
  });

  it("never overrides existing entries and reports them as kept", async () => {
    const cwd = await makeApp({ dependencies: { "next-intl": "^9.0.0" } });
    const report = await injectConsumerDependencies(cwd, "1.2.3", false);
    expect(report.kept).toContain("next-intl");
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["next-intl"]).toBe("^9.0.0");
  });

  it("handles a package.json without dependencies and respects dry-run", async () => {
    const cwd = await makeApp({ name: "bare" });
    const report = await injectConsumerDependencies(cwd, "1.2.3", true);
    expect(report.added.length).toBeGreaterThan(0);
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies).toBeUndefined();
  });
});
