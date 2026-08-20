import { createHash } from "node:crypto";

const STAMP = /^\/\/ @nukesai-pos\/cli generated — do not edit\. hash: ([a-f0-9]{64})\n/;

/** Hash is computed over the body EXCLUDING the stamp line, LF-normalized. */
export function hashBody(body: string): string {
  return createHash("sha256").update(body.replaceAll("\r\n", "\n")).digest("hex");
}

export function stamp(body: string): string {
  return `// @nukesai-pos/cli generated — do not edit. hash: ${hashBody(body)}\n${body}`;
}

export type StampState =
  | { readonly kind: "absent" }
  | { readonly kind: "pristine" }
  | { readonly kind: "modified"; readonly body: string };

/**
 * Decide whether an existing generated file may be overwritten.
 * - absent   -> not ours, or never generated; ask before touching.
 * - pristine -> body still matches its stamp; safe to overwrite silently.
 * - modified -> the user edited it; never clobber, emit a .new file + diff.
 */
export function inspect(contents: string): StampState {
  const match = STAMP.exec(contents);
  if (match === null) return { kind: "absent" };

  const recorded = match[1];
  const body = contents.slice(match[0].length);
  return hashBody(body) === recorded ? { kind: "pristine" } : { kind: "modified", body };
}
