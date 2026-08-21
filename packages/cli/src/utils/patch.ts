import { readFile } from "node:fs/promises";

import { builders, loadFile, writeFile } from "magicast";

const WRAPPER = "withNukesPos";
const WRAPPER_SOURCE = "@nukesai-pos/frontend/next-config";

/** Default-export shapes magicast can wrap without changing their semantics. */
const WRAPPABLE = new Set([
  "object",
  "identifier",
  "function-call",
  "arrow-function-expression",
  "function-expression",
]);

const manualInstructions = (configPath: string, reason: string): string =>
  [
    `Cannot safely wrap ${configPath}: ${reason}.`,
    "Wrap it by hand and re-run:",
    "",
    `  import { ${WRAPPER} } from "${WRAPPER_SOURCE}";`,
    `  export default ${WRAPPER}(yourConfig);`,
  ].join("\n");

/**
 * Wrap the host app's next.config default export in withNukesPos()
 * (@nukesai-pos/frontend/next-config: serverExternalPackages + the next-intl
 * plugin). Idempotent: a second run detects the existing wrapper and no-ops.
 * Returns true when the file was modified. Verified round-trip with magicast:
 * imports, types and formatting preserved.
 *
 * Shapes this cannot express (CommonJS `module.exports`, a hoisted
 * `export default function`) are REFUSED with copy-paste instructions rather
 * than half-written: the CLI writes into customer repositories, and a config
 * it mangles breaks every later `next build`.
 */
export async function patchNextConfig(configPath: string, dryRun: boolean): Promise<boolean> {
  const source = await readFile(configPath, "utf8");
  if (/(?:^|\n)\s*module\.exports\s*=/.test(source) && !source.includes("export default")) {
    throw new Error(manualInstructions(configPath, "it is a CommonJS module (module.exports)"));
  }

  const mod = await loadFile(configPath);

  const alreadyImported = mod.imports.$items.some((item) => item.from === WRAPPER_SOURCE);
  let defaultExport: { $type?: string; $callee?: string } | undefined;
  try {
    defaultExport = mod.exports.default as { $type?: string; $callee?: string } | undefined;
  } catch (error) {
    // magicast throws on shapes it cannot proxy (e.g. FunctionDeclaration).
    throw new Error(
      manualInstructions(configPath, `its default export is not wrappable (${String(error)})`),
      { cause: error },
    );
  }
  const kind: string | undefined = defaultExport?.$type;
  if (kind === undefined || !WRAPPABLE.has(kind)) {
    throw new Error(
      manualInstructions(configPath, `its default export is ${kind ?? "missing"}, not a config`),
    );
  }

  const alreadyWrapped = kind === "function-call" && defaultExport?.$callee === WRAPPER;
  if (alreadyImported && alreadyWrapped) return false;

  if (!alreadyImported) {
    mod.imports.$prepend({ from: WRAPPER_SOURCE, imported: WRAPPER });
  }
  if (!alreadyWrapped) {
    // `export default {...} satisfies NextConfig` (and the `as NextConfig`
    // form) is what Next's own docs recommend, and magicast unwraps both to the
    // inner object — so reassigning `mod.exports.default` would DROP the
    // annotation and strand the now-unused `import type { NextConfig }`.
    // Wrap the inner expression in place instead, leaving the cast intact.
    // magicast's AST is loosely typed; this is the ESTree shape it produces.
    interface AstNode {
      type: string;
      declaration?: AstNode;
      expression?: AstNode;
    }
    const program = mod.$ast as unknown as { body: AstNode[] };
    const declaration = program.body.find(
      (node) => node.type === "ExportDefaultDeclaration",
    )?.declaration;
    const annotated =
      declaration?.type === "TSSatisfiesExpression" || declaration?.type === "TSAsExpression";
    if (annotated && declaration.expression !== undefined) {
      // Built by hand: passing an existing AST node to builders.functionCall
      // makes magicast try to serialize it as a literal ("circular reference").
      declaration.expression = {
        type: "CallExpression",
        callee: { type: "Identifier", name: WRAPPER },
        arguments: [declaration.expression],
        optional: false,
      } as unknown as AstNode;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- magicast's module proxy is `any`-typed by design
      mod.exports.default = builders.functionCall(WRAPPER, mod.exports.default);
    }
  }

  if (!dryRun) await writeFile(mod, configPath);
  return true;
}
