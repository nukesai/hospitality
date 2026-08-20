import { describe, expect, it } from "vitest";

import { buildPosMessages, pickPosLocale } from "./request-config.js";

describe("pickPosLocale", () => {
  it("prefers explicit over resolved over cookie, skipping unsupported candidates", () => {
    expect(pickPosLocale({ explicitLocale: "ne", resolvedLocale: "en" })).toBe("ne");
    expect(pickPosLocale({ explicitLocale: "fr", resolvedLocale: "ne" })).toBe("ne");
    expect(pickPosLocale({ resolvedLocale: null, cookieLocale: "ne" })).toBe("ne");
    expect(pickPosLocale({})).toBe("en");
  });

  it("honors custom locale sets and defaults", () => {
    expect(pickPosLocale({ cookieLocale: "de" }, ["de", "fr"], "fr")).toBe("de");
    expect(pickPosLocale({ cookieLocale: "en" }, ["de", "fr"], "fr")).toBe("fr");
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
