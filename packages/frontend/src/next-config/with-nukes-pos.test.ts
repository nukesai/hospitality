import { describe, expect, it } from "vitest";

import { withNukesPos } from "./with-nukes-pos.js";

describe("withNukesPos", () => {
  it("externalizes the backend and wires the next-intl plugin by default", () => {
    const config = withNukesPos({ reactStrictMode: true });
    expect(config.reactStrictMode).toBe(true);
    expect(config.serverExternalPackages).toContain("@nukesai-pos/backend");
    // On Next 16 the plugin aliases `next-intl/config` to the app's request file.
    const alias = (config as { turbopack?: { resolveAlias?: Record<string, string> } }).turbopack
      ?.resolveAlias;
    // The plugin locates ./(src/)i18n/request.* relative to cwd — assert the
    // alias exists and targets the convention file, wherever it resolved.
    expect(alias?.["next-intl/config"]).toMatch(/i18n\/request\.ts$/);
  });

  it("never duplicates an existing external entry and keeps consumer values", () => {
    const config = withNukesPos(
      { serverExternalPackages: ["@nukesai-pos/backend", "pg"] },
      { intl: false },
    );
    expect(config.serverExternalPackages).toEqual(["@nukesai-pos/backend", "pg"]);
  });

  it("skips the intl plugin when the app wires next-intl itself", () => {
    const config = withNukesPos({}, { intl: false }) as {
      turbopack?: { resolveAlias?: Record<string, string> };
      serverExternalPackages?: string[];
    };
    expect(config.turbopack?.resolveAlias?.["next-intl/config"]).toBeUndefined();
  });

  it("passes a custom requestConfig path through to the plugin", () => {
    const config = withNukesPos({}, { requestConfig: "./src/i18n/custom-request.ts" }) as {
      turbopack?: { resolveAlias?: Record<string, string> };
    };
    expect(config.turbopack?.resolveAlias?.["next-intl/config"]).toBe(
      "./src/i18n/custom-request.ts",
    );
  });

  it("adds the experimental barrel optimization only on explicit opt-in", () => {
    expect(withNukesPos({}, { intl: false }).experimental?.optimizePackageImports).toBeUndefined();
    const optimized = withNukesPos(
      { experimental: { optimizePackageImports: ["lodash-es"] } },
      { intl: false, optimizePackageImports: true },
    );
    expect(optimized.experimental?.optimizePackageImports).toEqual([
      "lodash-es",
      "@nukesai-pos/frontend",
      "@nukesai-pos/common",
    ]);
    const fresh = withNukesPos({}, { intl: false, optimizePackageImports: true });
    expect(fresh.experimental?.optimizePackageImports).toEqual([
      "@nukesai-pos/frontend",
      "@nukesai-pos/common",
    ]);
  });
});
