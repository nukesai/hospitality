export type Runtime = "server" | "client";

/**
 * The only environment sniff in the codebase. Reads `window` off `globalThis`
 * (this package compiles without DOM lib types) and checks `window.document`
 * too, so a Node global-shim does not read as a browser.
 */
const isBrowser = (): boolean => {
  const candidate = (globalThis as { window?: { document?: unknown } }).window;
  return candidate?.document !== undefined;
};

export const currentRuntime = (): Runtime => (isBrowser() ? "client" : "server");

export class RuntimeBoundaryError extends Error {
  override readonly name = "RuntimeBoundaryError";

  constructor(expected: Runtime, moduleId: string) {
    super(
      `[@nukesai-pos] Runtime boundary violated: "${moduleId}" is ${expected}-only `
        + `but was evaluated in the ${expected === "server" ? "client" : "server"} runtime. `
        + `This means a build-time guard was bypassed. See docs/architecture/isolation.md.`,
    );
  }
}

/**
 * Call at module scope in server-only modules, immediately after
 * `import "server-only"`. The import is the build-time gate; this is the
 * runtime net.
 */
export function assertServerRuntime(moduleId: string): void {
  if (isBrowser()) throw new RuntimeBoundaryError("server", moduleId);
}

/** Mirror of the above for browser-only modules (e.g. anything touching IndexedDB). */
export function assertClientRuntime(moduleId: string): void {
  if (!isBrowser()) throw new RuntimeBoundaryError("client", moduleId);
}
