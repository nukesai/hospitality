import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { detectProject } from "./detect.js";

interface FixtureOptions {
  readonly srcDir?: boolean;
  readonly nextConfigName?: string;
  readonly tsconfig?: string | null;
  readonly packageJson?: string;
  readonly skipAppDir?: boolean;
}

const makeApp = async (options: FixtureOptions = {}): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-detect-"));
  await writeFile(
    path.join(cwd, options.nextConfigName ?? "next.config.ts"),
    "export default {}\n",
  );
  if (!options.skipAppDir) {
    const appDir = options.srcDir ? path.join(cwd, "src", "app") : path.join(cwd, "app");
    await mkdir(appDir, { recursive: true });
  }
  if (options.tsconfig !== null) {
    await writeFile(path.join(cwd, "tsconfig.json"), options.tsconfig ?? "{}");
  }
  await writeFile(
    path.join(cwd, "package.json"),
    options.packageJson ?? '{ "dependencies": { "next": "16.3.1" } }',
  );
  return cwd;
};

describe("detectProject", () => {
  it("throws without a next.config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-detect-"));
    await expect(detectProject(cwd)).rejects.toThrow(/No next\.config/);
  });

  it("throws without an app router directory", async () => {
    const cwd = await makeApp({ skipAppDir: true });
    await expect(detectProject(cwd)).rejects.toThrow(/requires the App Router/);
  });

  it("detects a plain app/ project with TypeScript and next version", async () => {
    const cwd = await makeApp();
    const info = await detectProject(cwd);
    expect(info.isSrcDir).toBe(false);
    expect(info.appDir).toBe(path.resolve(cwd, "app"));
    expect(info.isTypeScript).toBe(true);
    expect(info.nextVersion).toBe("16.3.1");
    expect(info.nextConfigPath).toContain("next.config.ts");
    expect(info.aliasPrefix).toBeNull();
  });

  it("detects src/app layouts", async () => {
    const cwd = await makeApp({ srcDir: true });
    const info = await detectProject(cwd);
    expect(info.isSrcDir).toBe(true);
    expect(info.appDir).toBe(path.resolve(cwd, "src", "app"));
  });

  it("handles JavaScript projects (no tsconfig) and missing next dependency", async () => {
    const cwd = await makeApp({
      tsconfig: null,
      nextConfigName: "next.config.mjs",
      packageJson: "{}",
    });
    const info = await detectProject(cwd);
    expect(info.isTypeScript).toBe(false);
    expect(info.aliasPrefix).toBeNull();
    expect(info.nextVersion).toBeNull();
  });

  it("extracts the import alias from tsconfig paths (with comments)", async () => {
    const cwd = await makeApp({
      srcDir: true,
      tsconfig: `{
        // JSONC on purpose
        "compilerOptions": { "paths": { "~/*": ["./unrelated/*"], "@/*": ["./src/*"] } }
      }`,
    });
    const info = await detectProject(cwd);
    expect(info.aliasPrefix).toBe("@");
  });

  it("ignores tsconfig paths that do not map to the project root", async () => {
    const cwd = await makeApp({
      tsconfig: '{ "compilerOptions": { "paths": { "#lib/*": ["./lib/deep/*"] } } }',
    });
    const info = await detectProject(cwd);
    expect(info.aliasPrefix).toBeNull();
  });
});
