import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { injectConsumerDependencies, posRange } from "./deps.js";

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

  it("never shadows a package the consumer declared in devDependencies", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-deps-dev-"));
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ devDependencies: { zod: "^3.25.0" }, peerDependencies: { next: "^16" } }),
    );

    const report = await injectConsumerDependencies(cwd, "1.2.3", false);
    expect(report.added).not.toContain("zod");
    expect(report.kept).toContain("zod");

    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // A second, conflicting-major entry under dependencies would win
    // resolution and break the consumer's own zod-3 code.
    expect(pkg.dependencies.zod).toBeUndefined();
    expect(pkg.devDependencies.zod).toBe("^3.25.0");
  });
  // Both branches of the range ternary. The 100% gate is explicit-include, and
  // a caret on a canary is the bug this pins shut.
  describe("posRange", () => {
    it("carets a stable version so a scaffolded app tracks minors and patches", () => {
      expect(posRange("1.2.3")).toBe("^1.2.3");
    });

    it("carets a beta so a pilot graduates onto the GA without editing a file", () => {
      expect(posRange("1.2.0-beta.20260826120000.sha-9f3ab21")).toBe(
        "^1.2.0-beta.20260826120000.sha-9f3ab21",
      );
    });

    it("pins a canary exactly, because ^0.0.0-canary-* resolves no stable release", () => {
      const canary = "0.0.0-canary-20260826120000-9f3ab21";
      expect(posRange(canary)).toBe(canary);
      expect(posRange(canary).startsWith("^")).toBe(false);
    });
  });

  it("writes an exact pin, not a caret, when the CLI itself is a canary", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-deps-canary-"));
    await writeFile(path.join(cwd, "package.json"), JSON.stringify({}));

    const canary = "0.0.0-canary-20260826120000-9f3ab21";
    await injectConsumerDependencies(cwd, canary, false);

    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    for (const name of ["@nukesai-pos/backend", "@nukesai-pos/common", "@nukesai-pos/frontend"]) {
      expect(pkg.dependencies[name]).toBe(canary);
    }
  });
});
