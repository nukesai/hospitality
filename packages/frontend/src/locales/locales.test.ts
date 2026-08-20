import { en as commonEn } from "@nukesai-pos/common/i18n/locales/en";
import { ne as commonNe } from "@nukesai-pos/common/i18n/locales/ne";
import { describe, expect, it } from "vitest";

import { flattenPosMessages } from "../i18n/nest.js";
import { en } from "./en.js";
import { posMessageLoaders } from "./loaders.js";
import { ne } from "./ne.js";

describe("derived locales", () => {
  it("en is the common catalog nested under pos — loss-lessly", () => {
    expect(flattenPosMessages(en.pos)).toEqual(commonEn);
  });

  it("ne carries every en key (the locked key contract), values translated", () => {
    expect(flattenPosMessages(ne.pos)).toEqual(commonNe);
    expect(Object.keys(flattenPosMessages(ne.pos)).sort()).toEqual(
      Object.keys(flattenPosMessages(en.pos)).sort(),
    );
  });

  it("ships a static loader per supported locale (bundler-resolvable)", async () => {
    expect(Object.keys(posMessageLoaders).sort()).toEqual(["en", "ne"]);
    await expect(posMessageLoaders.en?.()).resolves.toEqual(en);
    await expect(posMessageLoaders.ne?.()).resolves.toEqual(ne);
  });
});
