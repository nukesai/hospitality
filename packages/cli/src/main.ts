#!/usr/bin/env node
import { createRequire } from "node:module";

import { intro, log, outro } from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";

import { runAdd } from "./commands/add.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runUpgrade } from "./commands/upgrade.js";
import { errorMessage } from "./utils/messages.js";

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require("../package.json") as { version: string };

interface GlobalOptions {
  readonly cwd: string;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly silent: boolean;
  readonly force: boolean;
}

function globalOptions(command: Command): GlobalOptions {
  const opts = command.optsWithGlobals<{
    cwd: string;
    yes: boolean;
    dryRun: boolean;
    silent: boolean;
    force: boolean;
  }>();
  return {
    cwd: opts.cwd,
    yes: opts.yes,
    dryRun: opts.dryRun,
    silent: opts.silent,
    force: opts.force,
  };
}

const program = new Command()
  .name("nukes-pos")
  .description("Scaffold Nukes POS into an existing Next.js 16 application.")
  .version(CLI_VERSION, "-v, --version")
  .option("-c, --cwd <path>", "working directory", process.cwd())
  .option("-y, --yes", "accept all defaults, do not prompt", false)
  .option("-d, --dry-run", "print the plan without writing any files", false)
  .option("-s, --silent", "suppress non-error output", false)
  .option("--force", "proceed even if the git worktree is dirty", false);

program
  .command("init")
  .description("Scaffold the full Nukes POS integration into the host Next.js app.")
  .option("--i18n-routing", "locale-prefixed URLs: proxy.ts + app/[locale] tree", false)
  .option("--features <names...>", "feature routers to scaffold", ["orders"])
  .action(async (local: { i18nRouting: boolean; features: string[] }, command: Command) => {
    const options = globalOptions(command);
    if (!options.silent) intro(pc.bgCyan(pc.black(" nukes-pos init ")));
    const report = await runInit({
      ...options,
      version: CLI_VERSION,
      i18nRouting: local.i18nRouting,
      features: local.features,
    });
    if (!options.silent) {
      for (const file of report.created) log.success(`created  ${file}`);
      for (const file of report.updated) log.success(`updated  ${file}`);
      for (const file of report.skipped) log.info(`skipped  ${file} (already current)`);
      for (const file of report.conflicted)
        log.warn(`conflict ${file} — hand-edited; wrote ${file}.new`);
      if (report.dependenciesAdded.length > 0)
        log.success(`deps     ${report.dependenciesAdded.join(", ")}`);
      if (report.nextConfigPatched) log.success("patched  next.config (withNukesPos)");
      if (report.envExampleTouched) log.success("updated  .env.example");
      outro(
        options.dryRun
          ? "Dry run — nothing was written."
          : "Nukes POS initialised. Install dependencies, fill .env, and start your app.",
      );
    }
  });

program
  .command("add")
  .argument("[features...]", "optional surfaces to wire, e.g. reports kds")
  .description(
    "Manage the app-local router composition: creates server/routers/_app.ts (once) and wires features into it.",
  )
  .action(async (features: readonly string[], _local: unknown, command: Command) => {
    const options = globalOptions(command);
    const report = await runAdd(features, options);
    if (report.unknown.length > 0) {
      log.error(`Unknown feature(s): ${report.unknown.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    if (!options.silent) {
      for (const feature of report.added) log.success(`added    ${feature}`);
      for (const feature of report.alreadyPresent) log.info(`skipped  ${feature} (already added)`);
      if (report.extensionCreated === true && report.extensionFile !== undefined) {
        log.success(`${options.dryRun ? "would create" : "created"}  ${report.extensionFile}`);
        log.info("Point your app/api/pos route at its `appRouter` to use it.");
      }
      if (options.dryRun) outro("Dry run — nothing was written.");
    }
  });

program
  .command("doctor")
  .description("Diagnose the installation. Read-only. Exits non-zero on error.")
  .action(async (_local: unknown, command: Command) => {
    const options = globalOptions(command);
    const report = await runDoctor(options);
    if (report.errors.length > 0) {
      for (const problem of report.errors) log.error(problem);
      process.exitCode = 1;
      return;
    }
    for (const note of report.warnings) log.warn(note);
    if (!options.silent) log.success("No problems detected.");
  });

program
  .command("upgrade")
  .description("Regenerate scaffolded files for the installed version (pristine files only).")
  .action(async (_local: unknown, command: Command) => {
    const options = globalOptions(command);
    const report = await runUpgrade({ ...options, version: CLI_VERSION });
    if (!options.silent) {
      log.info(`Scaffold ${report.fromVersion} -> ${report.toVersion}`);
      for (const entry of report.plan) log.info(`${entry.action.padEnd(10)} ${entry.file}`);
      outro(
        options.dryRun
          ? "Dry run — nothing was written."
          : "Upgrade applied. Hand-edited files were preserved (see *.new siblings).",
      );
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (error: unknown) {
  log.error(errorMessage(error));
  process.exitCode = 1;
}
