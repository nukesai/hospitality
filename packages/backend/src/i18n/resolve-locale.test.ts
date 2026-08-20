import { en } from "@nukesai-pos/common/i18n/locales/en";
import { ne } from "@nukesai-pos/common/i18n/locales/ne";
import { describe, expect, it } from "vitest";

import {
  createRequestTranslator,
  defaultLocaleConfig,
  type LocaleConfig,
  resolveLocale,
} from "./resolve-locale.js";

const config: LocaleConfig = {
  defaultLocale: "en",
  messagesByLocale: {
    en: { greet: "Hello {name}" },
    ne: { greet: "Namaste {name}" },
  },
};

describe("defaultLocaleConfig", () => {
  it("bundles the en and ne catalogs under the given default locale", () => {
    const bundled = defaultLocaleConfig("ne");
    expect(bundled.defaultLocale).toBe("ne");
    expect(bundled.messagesByLocale.en).toBe(en);
    expect(bundled.messagesByLocale.ne).toBe(ne);
  });
});

describe("resolveLocale", () => {
  it("returns a user preference that is a supported locale", () => {
    expect(resolveLocale(config, "ne", "en")).toBe("ne");
  });

  it("ignores an unsupported user preference and falls through to the header", () => {
    expect(resolveLocale(config, "fr", "ne")).toBe("ne");
  });

  it("picks the first supported primary tag from an Accept-Language header", () => {
    expect(resolveLocale(config, undefined, "fr-FR,ne;q=0.9,en;q=0.8")).toBe("ne");
  });

  it("strips q-values and region subtags, case-insensitively", () => {
    expect(resolveLocale(config, undefined, "NE-NP;q=0.7, en-GB;q=0.5")).toBe("ne");
  });

  it("matches a region tag by its primary subtag", () => {
    expect(resolveLocale(config, undefined, "en-US")).toBe("en");
  });

  it("returns the default locale when no header language is supported", () => {
    expect(resolveLocale(config, undefined, "fr-FR,de;q=0.5")).toBe("en");
  });

  it("returns the default locale for a null header and no preference", () => {
    expect(resolveLocale(config, undefined, null)).toBe("en");
  });

  it("returns the default locale when the header is an empty string", () => {
    expect(resolveLocale(config, undefined, "")).toBe("en");
  });
});

describe("createRequestTranslator", () => {
  it("translates with the catalog of a known locale", () => {
    const translator = createRequestTranslator(config, "ne");
    expect(translator.t("greet", { name: "Pawan" })).toBe("Namaste Pawan");
  });

  it("falls back to the default locale catalog for an unknown locale", () => {
    const translator = createRequestTranslator(config, "fr");
    expect(translator.t("greet", { name: "Pawan" })).toBe("Hello Pawan");
  });

  it("falls back to an empty catalog when the default locale itself is unknown", () => {
    const broken: LocaleConfig = { defaultLocale: "xx", messagesByLocale: {} };
    const translator = createRequestTranslator(broken, "yy");
    expect(translator.t("greet")).toBe("greet");
  });
});
