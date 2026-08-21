import { describe, expect, it } from "vitest";

import { definePosRouting, POS_DEFAULT_LOCALE, POS_LOCALES } from "./routing.js";

describe("definePosRouting", () => {
  it("defaults to the shipped locales with as-needed prefixes", () => {
    expect(definePosRouting()).toEqual({
      locales: ["en", "ne"],
      defaultLocale: "en",
      localePrefix: "as-needed",
    });
    expect(POS_LOCALES).toEqual(["en", "ne"]);
    expect(POS_DEFAULT_LOCALE).toBe("en");
  });

  it("honors consumer overrides including detection/cookie switches", () => {
    expect(
      definePosRouting({
        locales: ["en", "de"],
        defaultLocale: "de",
        localePrefix: "always",
        localeDetection: false,
        localeCookie: false,
      }),
    ).toEqual({
      locales: ["en", "de"],
      defaultLocale: "de",
      localePrefix: "always",
      localeDetection: false,
      localeCookie: false,
    });
  });

  it("preserves the LITERAL locale tuple the scaffolded AppConfig augmentation narrows on", () => {
    const routing = definePosRouting();
    expect(routing.locales).toEqual(["en", "ne"]);
    // `Locale: (typeof routing.locales)[number]` must be a union, not `string`
    // — otherwise the shipped global.d.ts augmentation is decorative and every
    // getTranslations({ locale }) typo compiles.
    const locale: (typeof routing.locales)[number] = "ne";
    // @ts-expect-error -- "enn" is not a POS locale
    const typo: (typeof routing.locales)[number] = "enn";

    const custom = definePosRouting({ locales: ["en", "fr"], defaultLocale: "fr" });
    expect(custom.locales).toEqual(["en", "fr"]);
    const french: (typeof custom.locales)[number] = "fr";
    // @ts-expect-error -- "ne" is not in the consumer's locale set
    const missing: (typeof custom.locales)[number] = "ne";

    expect([locale, typo, french, missing]).toEqual(["ne", "enn", "fr", "ne"]);
  });
});
