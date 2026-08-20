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
});
