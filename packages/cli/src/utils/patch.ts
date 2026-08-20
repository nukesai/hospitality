import { builders, loadFile, writeFile } from "magicast";

const WRAPPER = "withNukesPos";
const WRAPPER_SOURCE = "@nukesai-pos/frontend/next-config";

/**
 * Wrap the host app's next.config default export in withNukesPos()
 * (@nukesai-pos/frontend/next-config: serverExternalPackages + the next-intl
 * plugin). Idempotent: a second run detects the existing wrapper and no-ops.
 * Returns true when the file was modified. Verified round-trip with magicast:
 * imports, types and formatting preserved.
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
