import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { inspect, stamp } from "./stamp.js";

export type WriteOutcome = "created" | "updated" | "skipped" | "conflicted";

export interface WriteResult {
  readonly path: string;
  readonly outcome: WriteOutcome;
}

/**
 * Idempotent, ownership-respecting write of a generated file:
 * - absent            -> create (stamped)
 * - pristine + same   -> skip
 * - pristine + newer  -> overwrite (that is what the stamp is FOR)
 * - modified/unstamped-> never clobber; drop `<file>.new` beside it
 */
export async function writeGenerated(
  cwd: string,
  relativePath: string,
  body: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const absolute = path.resolve(cwd, relativePath);
  const stamped = stamp(body);

  if (!existsSync(absolute)) {
    if (!dryRun) {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, stamped);
    }
    return { path: relativePath, outcome: "created" };
  }

  const existing = await readFile(absolute, "utf8");
  if (existing === stamped) return { path: relativePath, outcome: "skipped" };

  const state = inspect(existing);
  if (state.kind === "pristine") {
    if (!dryRun) await writeFile(absolute, stamped);
    return { path: relativePath, outcome: "updated" };
  }

  if (!dryRun) await writeFile(`${absolute}.new`, stamped);
  return { path: relativePath, outcome: "conflicted" };
}
