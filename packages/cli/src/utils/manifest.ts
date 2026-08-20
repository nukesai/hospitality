import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MANIFEST_NAME = "nukes-pos.json";

/** Persisted answers + generated-file ledger, committed to the consumer repo. */
export interface Manifest {
  readonly $schema: string;
  /** @nukesai-pos/* version that generated this install (fixed version group). */
  readonly version: string;
  readonly features: readonly string[];
  /** Repo-relative paths of every stamped generated file. */
  readonly files: readonly string[];
}

export const createManifest = (version: string): Manifest => ({
  $schema: "https://nukesai.com/schemas/nukes-pos.json",
  version,
  features: [],
  files: [],
});

export async function readManifest(cwd: string): Promise<Manifest | null> {
  try {
    const raw = await readFile(path.resolve(cwd, MANIFEST_NAME), "utf8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return null;
  }
}

export async function writeManifest(cwd: string, manifest: Manifest): Promise<void> {
  const contents = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.resolve(cwd, MANIFEST_NAME), contents);
}
