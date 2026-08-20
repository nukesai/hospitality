import { readFile, writeFile as fsWriteFile } from "node:fs/promises";

import { parse as parseJsonc, stringify as stringifyJsonc } from "comment-json";
import { builders, loadFile, writeFile } from "magicast";

const WRAPPER = "withNukesPos";
const WRAPPER_SOURCE = "@nukesai-pos/backend/next";

/**
 * Wrap the host app's next.config default export in withNukesPos().
 * Idempotent: a second run detects the existing wrapper and no-ops.
 * Returns true when the file was modified. Verified round-trip with magicast:
 * imports, types and formatting preserved.
 *
 * NOTE: `@nukesai-pos/backend/next` ships with the first feature release; the
 * patcher exists (and is fixture-tested) so `init` can adopt it then.
 */
export async function patchNextConfig(configPath: string, dryRun: boolean): Promise<boolean> {
  const mod = await loadFile(configPath);

  const alreadyImported = mod.imports.$items.some((item) => item.from === WRAPPER_SOURCE);
  const defaultExport = mod.exports.default as unknown as {
    $type?: string;
    $callee?: string;
  };
  const alreadyWrapped =
    defaultExport.$type === "function-call" && defaultExport.$callee === WRAPPER;

  if (alreadyImported && alreadyWrapped) return false;

  if (!alreadyImported) {
    mod.imports.$prepend({ from: WRAPPER_SOURCE, imported: WRAPPER });
  }
  if (!alreadyWrapped) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- magicast's module proxy is `any`-typed by design
    mod.exports.default = builders.functionCall(WRAPPER, mod.exports.default);
  }

  if (!dryRun) await writeFile(mod, configPath);
  return true;
}

/**
 * Add the @nukesai-pos/config path alias, preserving comments in tsconfig.json.
 * Returns true when the file was modified.
 */
export async function patchTsconfig(tsconfigPath: string, dryRun: boolean): Promise<boolean> {
  const source = await readFile(tsconfigPath, "utf8");
  const tsconfig = parseJsonc(source) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };

  tsconfig.compilerOptions ??= {};
  tsconfig.compilerOptions.paths ??= {};
  if ("@nukesai-pos/config" in tsconfig.compilerOptions.paths) return false;

  tsconfig.compilerOptions.paths["@nukesai-pos/config"] = ["./nukes-pos.config.ts"];

  if (!dryRun) await fsWriteFile(tsconfigPath, `${stringifyJsonc(tsconfig, null, 2)}\n`);
  return true;
}
