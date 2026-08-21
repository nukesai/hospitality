import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { runInit } from "./init.js";
import { runDoctor } from "./doctor.js";

const makeInitialisedApp = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-"));
  await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
  await mkdir(path.join(cwd, "app"), { recursive: true });
  await writeFile(path.join(cwd, "tsconfig.json"), "{}");
  await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
  await runInit({ cwd, dryRun: false, force: true, version: "0.0.0" });
  await writeFile(
    path.join(cwd, ".env"),
    `DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=${"a".repeat(32)}\nBETTER_AUTH_URL=http://localhost:3000\n`,
  );
  await mkdir(path.join(cwd, "node_modules/@nukesai-pos/backend"), { recursive: true });
  await writeFile(
    path.join(cwd, "node_modules/@nukesai-pos/backend/package.json"),
    '{ "version": "0.0.0" }',
  );
  return cwd;
};

describe("runDoctor", () => {
  it("passes a healthy installation", async () => {
    const cwd = await makeInitialisedApp();
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("flags the missing manifest and unwrapped next.config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-raw-"));
    await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
    await mkdir(path.join(cwd, "app"), { recursive: true });
    await writeFile(path.join(cwd, "tsconfig.json"), "{}");
    await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("withNukesPos"),
        expect.stringContaining("nukes-pos.json"),
        expect.stringContaining(".npmrc"),
      ]),
    );
  });

  it("reports missing scaffold files, lost markers, and version drift", async () => {
    const cwd = await makeInitialisedApp();
    await rm(path.join(cwd, "i18n/request.ts"));
    // Simulate an extension file recorded in the ledger whose markers were lost.
    const { readManifest, writeManifest } = await import("../utils/manifest.js");
    const manifest = await readManifest(cwd);
    if (manifest === null) throw new Error("manifest missing");
    await writeManifest(cwd, {
      ...manifest,
      files: [...manifest.files, "server/routers/_app.ts"],
    });
    await mkdir(path.join(cwd, "server", "routers"), { recursive: true });
    await writeFile(path.join(cwd, "server/routers/_app.ts"), "// markers gone\n");
    await writeFile(
      path.join(cwd, "node_modules/@nukesai-pos/backend/package.json"),
      '{ "version": "9.9.9" }',
    );
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("i18n/request.ts"),
        expect.stringContaining("marker blocks"),
      ]),
    );
    expect(report.warnings).toEqual(expect.arrayContaining([expect.stringContaining("9.9.9")]));
  });

  it("warns on JS-only apps without next, errors without any next.config", async () => {
    const bare = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-bare-"));
    const report = await runDoctor({ cwd: bare });
    expect(report.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("No next.config")]),
    );

    const js = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-js-"));
    await writeFile(path.join(js, "next.config.mjs"), "export default {};\n");
    await mkdir(path.join(js, "app"), { recursive: true });
    await writeFile(path.join(js, "package.json"), "{}");
    await writeFile(path.join(js, ".npmrc"), "registry=https://registry.npmjs.org/\n");
    const jsReport = await runDoctor({ cwd: js });
    expect(jsReport.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("TypeScript-first"),
        expect.stringContaining('"next" is not in dependencies'),
      ]),
    );
    expect(jsReport.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("no @nukesai-pos registry entry")]),
    );
  });

  it("warns when the packages are not installed yet", async () => {
    const cwd = await makeInitialisedApp();
    await rm(path.join(cwd, "node_modules"), { recursive: true });
    const report = await runDoctor({ cwd });
    expect(report.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("not installed yet")]),
    );
  });

  it("warns on hand-edited files and missing env, errors on a short secret", async () => {
    const cwd = await makeInitialisedApp();
    const target = path.join(cwd, "instrumentation.ts");
    await writeFile(target, "// hand edited without a stamp?? no: append\n", { flag: "a" });
    await writeFile(path.join(cwd, ".env"), "BETTER_AUTH_SECRET=short\n");
    const report = await runDoctor({ cwd });
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("hand-edited"),
        expect.stringContaining("DATABASE_URL"),
      ]),
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("32 characters")]),
    );
  });

  it("passes an app whose add-created _app.ts still has all four marker blocks", async () => {
    const cwd = await makeInitialisedApp();
    const { runAdd } = await import("./add.js");
    await runAdd(["orders"], { cwd, dryRun: false, force: true });
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("resolves .env.local OVER .env (Next's precedence) for the secret check", async () => {
    const cwd = await makeInitialisedApp();
    // Committed placeholder in .env, real secret in .env.local: the app boots
    // fine, so doctor must not fail CI.
    await writeFile(
      path.join(cwd, ".env"),
      "DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=dev\nBETTER_AUTH_URL=http://localhost:3000\n",
    );
    await writeFile(path.join(cwd, ".env.local"), `BETTER_AUTH_SECRET=${"b".repeat(64)}\n`);
    expect((await runDoctor({ cwd })).errors).toEqual([]);

    // ...and the inverse: a good .env overridden by a short .env.local IS a
    // problem, because that is the value the backend will reject.
    await writeFile(path.join(cwd, ".env.local"), "BETTER_AUTH_SECRET=too-short\n");
    expect((await runDoctor({ cwd })).errors).toEqual([
      "BETTER_AUTH_SECRET is shorter than 32 characters.",
    ]);
  });

  it("does not count commented-out env lines as set", async () => {
    const cwd = await makeInitialisedApp();
    await writeFile(
      path.join(cwd, ".env"),
      [
        "# DATABASE_URL=postgres://x", // commented out: NOT set
        "", // blank
        "JUST_A_WORD", // no separator
        "=leading-equals", // no name
        `BETTER_AUTH_SECRET=${"a".repeat(32)}`,
        "BETTER_AUTH_URL=http://localhost:3000",
      ].join("\n"),
    );
    expect((await runDoctor({ cwd })).warnings).toEqual([
      expect.stringContaining("DATABASE_URL is not set"),
    ]);
  });

  it("warns when POS_API_BASE_PATH is not excluded by the scaffolded proxy matcher", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nukes-cli-doctor-proxy-"));
    await writeFile(path.join(cwd, "next.config.ts"), "export default {};\n");
    await mkdir(path.join(cwd, "app"), { recursive: true });
    await writeFile(path.join(cwd, "tsconfig.json"), "{}");
    await writeFile(path.join(cwd, "package.json"), '{ "dependencies": { "next": "16.3.1" } }\n');
    await runInit({ cwd, dryRun: false, force: true, version: "0.0.0", i18nRouting: true });
    await writeFile(
      path.join(cwd, ".env"),
      `DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=${"a".repeat(32)}\nBETTER_AUTH_URL=http://x\nPOS_API_BASE_PATH=/pos-api\n`,
    );
    expect((await runDoctor({ cwd })).warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("which the proxy matcher does not exclude")]),
    );

    // The default mount IS excluded by the shipped matcher — no noise.
    await writeFile(
      path.join(cwd, ".env"),
      `DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=${"a".repeat(32)}\nBETTER_AUTH_URL=http://x\nPOS_API_BASE_PATH=/api/pos\n`,
    );
    expect((await runDoctor({ cwd })).warnings).not.toEqual(
      expect.arrayContaining([expect.stringContaining("proxy matcher")]),
    );

    // A hand-edited proxy that lost its matcher literal excludes nothing.
    await writeFile(path.join(cwd, "proxy.ts"), "export default () => undefined;\n");
    await writeFile(
      path.join(cwd, ".env"),
      `DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=${"a".repeat(32)}\nBETTER_AUTH_URL=http://x\nPOS_API_BASE_PATH=/api/pos\n`,
    );
    expect((await runDoctor({ cwd })).warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("which the proxy matcher does not exclude")]),
    );
  });

  it("says nothing about the matcher in cookie mode (no proxy is scaffolded)", async () => {
    const cwd = await makeInitialisedApp(); // default: no proxy.ts
    await writeFile(
      path.join(cwd, ".env"),
      `DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=${"a".repeat(32)}\nBETTER_AUTH_URL=http://x\nPOS_API_BASE_PATH=/pos-api\n`,
    );
    const report = await runDoctor({ cwd });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });
});
