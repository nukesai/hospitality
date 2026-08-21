import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { patchNextConfig } from "./patch.js";

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
    expect(patched).toContain('from "@nukesai-pos/frontend/next-config"');
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
      'import { withNukesPos } from "@nukesai-pos/frontend/next-config";\n\nexport default {};\n',
    );

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain("withNukesPos(");
    // The import must not be duplicated.
    expect(patched.match(/@nukesai-pos\/frontend\/next-config/g)).toHaveLength(1);
  });

  it("repairs a half-patched config (export wrapped, import missing)", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    await writeFile(configPath, "export default withNukesPos({});\n");

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain('from "@nukesai-pos/frontend/next-config"');
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

  it("REFUSES a CommonJS config instead of appending ESM to it", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.js");
    const source = "const nextConfig = { reactStrictMode: true };\nmodule.exports = nextConfig;\n";
    await writeFile(configPath, source);

    await expect(patchNextConfig(configPath, false)).rejects.toThrow(/CommonJS/);
    // The customer's file is untouched — an ESM import spliced into a CJS
    // config breaks every later `next build`.
    expect(await readFile(configPath, "utf8")).toBe(source);
  });

  it("REFUSES a hoisted `export default function` config", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    const source = "export default function cfg(phase) {\n  return { basePath: phase };\n}\n";
    await writeFile(configPath, source);

    await expect(patchNextConfig(configPath, false)).rejects.toThrow(/not wrappable/);
    expect(await readFile(configPath, "utf8")).toBe(source);
  });

  it("wraps an arrow-function config (withNukesPos composes it, never spreads it)", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    await writeFile(configPath, "export default (phase) => ({ basePath: phase });\n");

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain("withNukesPos(phase =>");
  });

  it("REFUSES a config with no default export at all", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.mjs");
    await writeFile(configPath, "export const config = {};\n");
    await expect(patchNextConfig(configPath, false)).rejects.toThrow(/not a config/);
  });

  it("PRESERVES `satisfies NextConfig` (the shape Next's docs recommend)", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.ts");
    await writeFile(
      configPath,
      'import type { NextConfig } from "next";\n\nexport default { reactStrictMode: true } satisfies NextConfig;\n',
    );

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    // Dropping the annotation would also strand `import type { NextConfig }`,
    // which fails the consumer's own noUnusedLocals.
    expect(patched).toContain("satisfies NextConfig");
    expect(patched).toContain("withNukesPos({ reactStrictMode: true })");
  });

  it("PRESERVES an `as NextConfig` assertion", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.ts");
    await writeFile(
      configPath,
      'import type { NextConfig } from "next";\n\nexport default { reactStrictMode: true } as NextConfig;\n',
    );

    expect(await patchNextConfig(configPath, false)).toBe(true);
    const patched = await readFile(configPath, "utf8");
    expect(patched).toContain("as NextConfig");
    expect(patched).toContain("withNukesPos({ reactStrictMode: true })");
  });

  it("stays idempotent on an annotated config", async () => {
    const cwd = await makeDir();
    const configPath = path.join(cwd, "next.config.ts");
    await writeFile(configPath, "export default { a: 1 } satisfies Record<string, number>;\n");
    await patchNextConfig(configPath, false);
    const once = await readFile(configPath, "utf8");
    expect(await patchNextConfig(configPath, false)).toBe(false);
    expect(await readFile(configPath, "utf8")).toBe(once);
  });
});
