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
        ".npmrc",
        "server/routers/_app.ts",
        "server/routers/health.ts",
        "server/routers/orders.ts",
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
    expect(manifest?.files).toContain("server/routers/orders.ts");

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
    expect(report.skipped).toEqual(expect.arrayContaining([".npmrc", "server/routers/health.ts"]));
  });

  it("never clobbers a hand-edited generated file — writes .new beside it", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    const target = path.join(cwd, "server/routers/_app.ts");
    await writeFile(target, `${await readFile(target, "utf8")}\n// my custom router\n`);
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.conflicted).toContain("server/routers/_app.ts");
    expect(existsSync(`${target}.new`)).toBe(true);
    expect(await readFile(target, "utf8")).toContain("my custom router");
  });

  it("leaves unstamped user files alone too", async () => {
    const cwd = await makeApp();
    await mkdir(path.join(cwd, "server", "routers"), { recursive: true });
    await writeFile(path.join(cwd, "server/routers/_app.ts"), "// the consumer's own file\n");
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.conflicted).toContain("server/routers/_app.ts");
    expect(await readFile(path.join(cwd, "server/routers/_app.ts"), "utf8")).toBe(
      "// the consumer's own file\n",
    );
  });

  it("rewrites a pristine file whose template changed (upgrade semantics)", async () => {
    const cwd = await makeApp();
    await runInit({ cwd, ...OPTIONS });
    const target = path.join(cwd, "server/routers/health.ts");
    await writeFile(target, stamp("// an OLD template body\n"));
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.updated).toContain("server/routers/health.ts");
    expect(await readFile(target, "utf8")).toContain("healthRouter");
  });

  it("appends the scope to an existing unrelated .npmrc and env block once", async () => {
    const cwd = await makeApp();
    await writeFile(path.join(cwd, ".npmrc"), "save-exact=true\n");
    await writeFile(path.join(cwd, ".env.example"), "MY_APP_KEY=x\n");
    const report = await runInit({ cwd, ...OPTIONS });
    expect(report.updated).toContain(".npmrc");
    const npmrc = await readFile(path.join(cwd, ".npmrc"), "utf8");
    expect(npmrc).toContain("save-exact=true");
    expect(npmrc).toContain("@nukesai-pos:registry=");
    const env = await readFile(path.join(cwd, ".env.example"), "utf8");
    expect(env).toContain("MY_APP_KEY=x");
    expect(env).toContain("POS_API_BASE_PATH");
    const again = await runInit({ cwd, ...OPTIONS });
    expect(again.envExampleTouched).toBe(false);
  });

  it("rejects unknown features up front", async () => {
    const cwd = await makeApp();
    await expect(runInit({ cwd, ...OPTIONS, features: ["nope"] })).rejects.toThrow(
      "Unknown feature(s): nope",
    );
  });

  it("dry-run writes nothing", async () => {
    const cwd = await makeApp();
    await writeFile(path.join(cwd, ".npmrc"), "save-exact=true\n"); // append path, dry
    const report = await runInit({ cwd, ...OPTIONS, force: false, dryRun: true });
    expect(await readFile(path.join(cwd, ".npmrc"), "utf8")).toBe("save-exact=true\n");
    expect(report.created.length).toBeGreaterThan(0);
    expect(existsSync(path.join(cwd, "lib"))).toBe(false);
    expect(await readManifest(cwd)).toBeNull();
    expect(await readFile(path.join(cwd, "next.config.ts"), "utf8")).not.toContain("withNukesPos");

    // Fresh app (no .npmrc at all): the create path must also stay dry.
    const fresh = await makeApp();
    await runInit({ cwd: fresh, ...OPTIONS, force: false, dryRun: true });
    expect(existsSync(path.join(fresh, ".npmrc"))).toBe(false);
  });
});
