import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ensureEnvExample } from "./env-file.js";

describe("ensureEnvExample", () => {
  it("creates the file, appends once, and stays idempotent", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-env-"));
    expect(await ensureEnvExample(cwd, false)).toBe(true);
    const first = await readFile(path.join(cwd, ".env.example"), "utf8");
    expect(first).toContain("DATABASE_URL=");
    expect(await ensureEnvExample(cwd, false)).toBe(false);
    expect(await readFile(path.join(cwd, ".env.example"), "utf8")).toBe(first);
  });

  it("appends below existing content and honors dry-run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-env2-"));
    await writeFile(path.join(cwd, ".env.example"), "APP_KEY=1\n");
    expect(await ensureEnvExample(cwd, true)).toBe(true);
    expect(await readFile(path.join(cwd, ".env.example"), "utf8")).toBe("APP_KEY=1\n");
    const fresh = await mkdtemp(path.join(tmpdir(), "nukes-cli-env3-"));
    expect(await ensureEnvExample(fresh, true)).toBe(true);
    expect(existsSync(path.join(fresh, ".env.example"))).toBe(false);
  });
});
