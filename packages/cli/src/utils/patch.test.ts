import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { patchNextConfig, patchTsconfig } from "./patch.js";

const makeDir = async (): Promise<string> => mkdtemp(path.join(tmpdir(), "nukes-cli-patch-"));

const FRESH_TS = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

describe("patchNextConfig", () => {
  it("wraps the default export and adds the import", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.ts");
    await writeFile(configPath, FRESH_TS);

    expect(await patchNextConfig(configPath, false)).toBe(true);

    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain('from "@nukesai-pos/backend/next"');
    expect(patched).toContain("withNukesPos(");
    // Host options preserved.
    expect(patched).toContain("reactStrictMode: true");
  });

  it("is idempotent: a second run detects the wrapper and no-ops", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    await writeFile(configPath, "export default { poweredByHeader: false };\n");

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const once = await readFile(configPath, "utf8");
    expect(await patchNextConfig(configPath, false)).toBe(false);
    expect(await readFile(configPath, "utf8")).toBe(once);
  });

  it("repairs a half-patched config (import present, export not wrapped)", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    await writeFile(
      configPath,
      'import { withNukesPos } from "@nukesai-pos/backend/next";\n\nexport default {};\n',
    );

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain("withNukesPos(");
    // The import must not be duplicated.
    expect(patched.match(/@nukesai-pos\/backend\/next/g)).toHaveLength(1);
  });

  it("repairs a half-patched config (export wrapped, import missing)", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    await writeFile(configPath, "export default withNukesPos({});\n");

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain('from "@nukesai-pos/backend/next"');
    // The wrapper must not be doubled.
    expect(patched.match(/withNukesPos\(/g)).toHaveLength(1);
  });

  it("dry-run reports the change without touching the file", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.ts");
    await writeFile(configPath, FRESH_TS);

    expect(await patchNextConfig(configPath, true)).toBe(true);
    expect(await readFile(configPath, "utf8")).toBe(FRESH_TS);
  });
});

describe("patchTsconfig", () => {
  it("adds the alias while preserving comments", async () => {
    const cwd = await makeDir();
    const tsconfigPath = path.join(cwd, "tsconfig.json");
    await writeFile(
      tsconfigPath,
      `{
  // keep me
  "compilerOptions": { "strict": true }
}
`,
    );

    expect(await patchTsconfig(tsconfigPath, false)).toBe(true);
    const patched = await readFile(tsconfigPath, "utf8");
    expect(patched).toContain("// keep me");
    expect(patched).toContain('"@nukesai-pos/config"');
  });

  it("no-ops when the alias already exists", async () => {
    const cwd = await makeDir();
    const tsconfigPath = path.join(cwd, "tsconfig.json");
    await writeFile(
      tsconfigPath,
      '{ "compilerOptions": { "paths": { "@nukesai-pos/config": ["./nukes-pos.config.ts"] } } }',
    );
    expect(await patchTsconfig(tsconfigPath, false)).toBe(false);
  });

  it("dry-run leaves the file untouched", async () => {
    const cwd = await makeDir();
    const tsconfigPath = path.join(cwd, "tsconfig.json");
    const original = "{}";
    await writeFile(tsconfigPath, original);
    expect(await patchTsconfig(tsconfigPath, true)).toBe(true);
    expect(await readFile(tsconfigPath, "utf8")).toBe(original);
  });
});
