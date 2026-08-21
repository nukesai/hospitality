import { describe, expect, it, vi } from "vitest";

import { buildPosMessages, resolvePosLocale } from "./request-config.js";

describe("resolvePosLocale", () => {
  it("prefers the first SUPPORTED candidate, skipping unsupported ones", async () => {
    expect(await resolvePosLocale(["ne", "en"])).toBe("ne");
    expect(await resolvePosLocale(["fr", "ne"])).toBe("ne");
    expect(await resolvePosLocale([null, undefined, "ne"])).toBe("ne");
    expect(await resolvePosLocale([])).toBe("en");
  });

  it("honors custom locale sets and defaults", async () => {
    expect(await resolvePosLocale(["de"], ["de", "fr"], "fr")).toBe("de");
    expect(await resolvePosLocale(["en"], ["de", "fr"], "fr")).toBe("fr");
  });

  it("resolves sync and async suppliers", async () => {
    expect(await resolvePosLocale([() => "ne"])).toBe("ne");
    expect(await resolvePosLocale([async () => Promise.resolve("ne")])).toBe("ne");
  });

  it("never runs a supplier once the cascade is decided (dynamic APIs stay untouched)", async () => {
    const later = vi.fn(() => "ne");
    expect(await resolvePosLocale(["en", later])).toBe("en");
    expect(later).not.toHaveBeenCalled();

    const skipped = vi.fn(() => "ne");
    expect(await resolvePosLocale(["fr", "en", skipped])).toBe("en");
    expect(skipped).not.toHaveBeenCalled();
  });
});

describe("buildPosMessages", () => {
  const posMessages = {
    en: () => ({ pos: { greeting: "Hello {name}" } }),
    ne: async () => Promise.resolve({ pos: { greeting: "नमस्ते {name}" } }),
  };

  it("loads the active locale's catalog (sync or async loader)", async () => {
    expect(await buildPosMessages("ne", "en", posMessages)).toEqual({
      pos: { greeting: "नमस्ते {name}" },
    });
  });

  it("falls back to the default locale's catalog for unknown locales", async () => {
    expect(await buildPosMessages("fr", "en", posMessages)).toEqual({
      pos: { greeting: "Hello {name}" },
    });
  });

  it("returns an empty tree when even the default loader is missing", async () => {
    expect(await buildPosMessages("fr", "de", posMessages)).toEqual({});
  });

  it("merges app messages and per-locale overrides after the catalog", async () => {
    const merged = await buildPosMessages("en", "en", posMessages, {
      messages: (locale) => ({ app: { title: `My App (${locale})` } }),
      overrides: { en: { pos: { greeting: "Yo {name}" } } },
    });
    expect(merged).toEqual({
      pos: { greeting: "Yo {name}" },
      app: { title: "My App (en)" },
    });
  });
});
