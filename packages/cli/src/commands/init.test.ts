import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readManifest } from "../utils/manifest.js";
import { stamp } from "../utils/stamp.js";
import { runInit } from "./init.js";

const makeApp = async (srcDir = false): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-init-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
  await mkdir(path.join(cwd, ...(srcDir ? ["src", "app"] : ["app"])), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(
    path.join(cwd, "package.json"),
    '{ "dependencies": { "next": "16.3.1", "zod": "^3.0.0" } }\n',
  );
  return cwd;
};

const OPTIONS = { dryRun: false, force: true, version: "0.0.0" };

describe("runInit", () => {
  it("scaffolds the complete cookie-mode integration by default", async () => {
    const cwd = await makeApp();
    const report = await runInit({ cwd, ...OPTIONS });

    expect(report.created).toEqual(
      expect.arrayContaining([
        "app/api/pos/[[...pos]]/route.ts",
        "instrumentation.ts",
        "i18n/request.ts",
        "global.d.ts",
        "app/(nukes-pos)/layout.tsx",
        "app/(nukes-pos)/admin/[[...admin]]/page.tsx",
        "nukes-pos.json",
      ]),
    );
    expect(report.conflicted).toEqual([]);
    // Cookie mode never touches the host's route structure.
    expect(existsSync(path.join(cwd, "proxy.ts"))).toBe(false);
    expect(existsSync(path.join(cwd, "app", "[locale]"))).toBe(false);

    const manifest = await readManifest(cwd);
    expect(manifest).toMatchObject({ version: "0.0.0", features: ["orders"] });
    // Routers are PACKAGE code — the DEFAULT consumer has no server dir at all.
    expect(existsSync(path.join(cwd, "server"))).toBe(false);
    expect(manifest?.files.some((f) => f.includes("server/"))).toBe(false);

    // Generated files are stamped; deps injected without clobbering existing pins.
    const route = await readFile(path.join(cwd, "app/api/pos/[[...pos]]/route.ts"), "utf8");
    expect(route).toMatch(/^\/\/ @nukesai-pos\/cli generated/);
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@nukesai-pos/backend"]).toBe("^0.0.0");
    expect(pkg.dependencies["next-intl"]).toBeDefined();
    expect(pkg.dependencies.zod).toBe("^3.0.0"); // existing entry wins
    expect(report.dependenciesAdded).toContain("@nukesai-pos/frontend");

    // next.config wrapped; env template appended.
    expect(await readFile(path.join(cwd, "next.config.ts"), "utf8")).toContain("withNukesPos");
    expect(report.nextConfigPatched).toBe(true);
    expect(await readFile(path.join(cwd, ".env.example"), "utf8")).toContain("BETTER_AUTH_SECRET");
  });

  it("scaffolds proxy.ts and the [locale] tree in routed mode under src/", async () => {
    const cwd = await makeApp(true);
    const report = await runInit({ cwd, ...OPTIONS, i18nRouting: true });
    expect(report.created).toEqual(
      expect.arrayContaining([
        "src/proxy.ts",
        "src/i18n/routing.ts",
        "src/i18n/request.ts",
        "src/app/[locale]/layout.tsx",
        "src/app/[locale]/(nukes-pos)/admin/[[...admin]]/page.tsx",
      ]),
    );
    const proxy = await readFile(path.join(cwd, "src/proxy.ts"), "utf8");
    expect(proxy).toContain("createPosProxy");
    expect(proxy).toContain("matcher"); // literal matcher lives in the consumer file
  });

  it("is idempotent: a second run skips every file", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.created).toEqual([]);
    expect(report.conflicted).toEqual([]);
    expect(report.skipped).toEqual(expect.arrayContaining(["instrumentation.ts"]));
  });

  it("never clobbers a hand-edited generated file — writes .new beside it", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    const target = path.join(cwd, "instrumentation.ts");
    await writeFile(target, `${await readFile(target, "utf8")}\n// my custom hook\n`);
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.conflicted).toContain("instrumentation.ts");
    expect(existsSync(`${target}.new`)).toBe(true);
    expect(await readFile(target, "utf8")).toContain("my custom hook");
  });

  it("leaves unstamped user files alone too", async () => {
    const cwd = await makeApp();
    await writeFile(path.join(cwd, "instrumentation.ts"), "// the consumer's own file\n");
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.conflicted).toContain("instrumentation.ts");
    expect(await readFile(path.join(cwd, "instrumentation.ts"), "utf8")).toBe(
      "// the consumer's own file\n",
    );
  });

  it("rewrites a pristine file whose template changed (upgrade semantics)", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    const target = path.join(cwd, "instrumentation.ts");
    await writeFile(target, stamp("// an OLD template body\n"));
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.updated).toContain("instrumentation.ts");
    expect(await readFile(target, "utf8")).toContain("registerGlobalErrorHandlers");
  });

  it("never touches the consumer's .npmrc — the packages are public", async () => {
    // Scaffolding registry auth would force every consumer (and their CI) to
    // set NPM_TOKEN for packages that need no credentials at all.
    const cwd = await makeApp();
    await writeFile(path.join(cwd, ".npmrc"), "save-exact=true\n");
    await writeFile(path.join(cwd, ".env.example"), "MY_APP_KEY=x\n");
    const report = await runInit({ cwd, ...OPTIONS });

    expect(await readFile(path.join(cwd, ".npmrc"), "utf8")).toBe("save-exact=true\n");
    expect([...report.created, ...report.updated, ...report.skipped]).not.toContain(".npmrc");

    const env = await readFile(path.join(cwd, ".env.example"), "utf8");
    expect(env).toContain("MY_APP_KEY=x");
    expect(env).toContain("POS_API_BASE_PATH");
    const again = await runInit({ cwd, ...OPTIONS });
    expect(again.envExampleTouched).toBe(false);
  });

  it("creates no .npmrc in a fresh app either", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    expect(existsSync(path.join(cwd, ".npmrc"))).toBe(false);
  });

  it("rejects unknown features up front", async () => {
    const cwd = await makeApp();
    await expect(runInit({ cwd, ...OPTIONS, features: ["nope"] })).rejects.toThrow(
      "Unknown feature(s): nope",
    );
  });

  it("dry-run writes nothing", async () => {
    const cwd = await makeApp();
    const report = await runInit({ cwd, ...OPTIONS, force: false, dryRun: true });
    expect(report.created.length).toBeGreaterThan(0);
    expect(existsSync(path.join(cwd, "lib"))).toBe(false);
    expect(await readManifest(cwd)).toBeNull();
    expect(await readFile(path.join(cwd, "next.config.ts"), "utf8")).not.toContain("withNukesPos");
  });

  it("keeps the add-owned ledger entry on re-run, and keeps --features authoritative", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, dryRun: false, force: true, version: "0.0.0" });
    const { runAdd } = await import("./add.js");
    await runAdd(
      ["kds"],
      { cwd, dryRun: false, force: true },
      { kds: { name: "kds", routerExport: "kdsRouter" } },
    );

    // Re-running init is a documented repair flow (doctor's own error text
    // tells users to) — it must not evict the file `add` owns...
    await runInit({ cwd, dryRun: false, force: true, version: "0.1.0" });
    const manifest = await readManifest(cwd);
    expect(manifest?.files).toContain("server/routers/_app.ts");
    // ...but the requested feature set IS authoritative: unioning made the set
    // grow forever and silently re-added features the user had removed.
    expect(manifest?.features).toEqual(["orders"]);
  });

  it("switching i18n modes REPLACES the plan-owned paths", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, dryRun: false, force: true, version: "0.0.0", i18nRouting: true });
    expect((await readManifest(cwd))?.files).toContain("proxy.ts");

    // Unioning pinned the old mode's paths in the ledger forever, and upgrade
    // re-derives the mode from them — so the switch could never take effect.
    await runInit({ cwd, dryRun: false, force: true, version: "0.0.0", i18nRouting: false });
    const files = (await readManifest(cwd))?.files ?? [];
    expect(files).not.toContain("proxy.ts");
    expect(files.some((file) => file.includes("[locale]"))).toBe(false);
    expect(files).toContain("app/(nukes-pos)/layout.tsx");
  });

  it("REFUSES an app whose next.config cannot be wrapped, before writing anything", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-init-cjs-"));
    await writeFile(path.join(cwd, "next.config.js"), "module.exports = { basePath: '/x' };\n");
    await mkdir(path.join(cwd, "app"), { recursive: true });
    await writeFile(path.join(cwd, "tsconfig.json"), "{}");
    await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');

    await expect(runInit({ cwd, dryRun: false, force: true, version: "0.0.0" })).rejects.toThrow(
      /CommonJS/,
    );
    // No half-installed repo: nothing was scaffolded, so `init` stays retryable.
    expect(existsSync(path.join(cwd, ".npmrc"))).toBe(false);
    expect(existsSync(path.join(cwd, "instrumentation.ts"))).toBe(false);
    expect(await readManifest(cwd)).toBeNull();
  });
});
