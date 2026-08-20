import { afterEach, describe, expect, it } from "vitest";

import {
  assertClientRuntime,
  assertServerRuntime,
  currentRuntime,
  RuntimeBoundaryError,
} from "./guard.js";

const WINDOW_KEY = "window";

const fakeBrowser = (): void => {
  Object.defineProperty(globalThis, WINDOW_KEY, {
    value: { document: {} },
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test cleanup of the injected global
  delete (globalThis as Record<string, unknown>)[WINDOW_KEY];
});

describe("runtime guard", () => {
  it("reports server in a plain Node environment", () => {
    expect(currentRuntime()).toBe("server");
    expect(() => {
      assertServerRuntime("test-module");
    }).not.toThrow();
    expect(() => {
      assertClientRuntime("test-module");
    }).toThrow(RuntimeBoundaryError);
  });

  it("reports client when a real-looking window exists", () => {
    fakeBrowser();
    expect(currentRuntime()).toBe("client");
    expect(() => {
      assertClientRuntime("test-module");
    }).not.toThrow();
    expect(() => {
      assertServerRuntime("test-module");
    }).toThrow(RuntimeBoundaryError);
  });

  it("does not treat a document-less window shim as a browser", () => {
    Object.defineProperty(globalThis, WINDOW_KEY, {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(currentRuntime()).toBe("server");
  });

  it("names the module and expected runtime in the error", () => {
    fakeBrowser();
    try {
      assertServerRuntime("packages/backend/src/index.ts");
      expect.unreachable("assertServerRuntime should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeBoundaryError);
      expect((error as RuntimeBoundaryError).message).toContain(
        'packages/backend/src/index.ts" is server-only',
      );
      expect((error as RuntimeBoundaryError).name).toBe("RuntimeBoundaryError");
    }
  });
});
