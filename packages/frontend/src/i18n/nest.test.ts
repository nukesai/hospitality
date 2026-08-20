import { en as commonEn } from "@nukesai-pos/common/i18n/locales/en";
import { ne as commonNe } from "@nukesai-pos/common/i18n/locales/ne";
import { describe, expect, it } from "vitest";

import { flattenPosMessages, nestPosMessages, POS_NAMESPACE } from "./nest.js";

describe("nestPosMessages", () => {
  it("nests dotted keys into a tree", () => {
    expect(nestPosMessages({ "a.b.c": "1", "a.b.d": "2", top: "3" })).toEqual({
      a: { b: { c: "1", d: "2" } },
      top: "3",
    });
  });

  it("round-trips BOTH shipped catalogs loss-lessly (the SSOT contract)", () => {
    expect(flattenPosMessages(nestPosMessages(commonEn))).toEqual(commonEn);
    expect(flattenPosMessages(nestPosMessages(commonNe))).toEqual(commonNe);
  });

  it("rejects a key nesting under an existing leaf", () => {
    expect(() => nestPosMessages({ "a.b": "leaf", "a.b.c": "deeper" })).toThrow(
      'Catalog key "a.b.c" nests under an existing leaf',
    );
  });

  it("rejects a leaf where a branch already exists", () => {
    expect(() => nestPosMessages({ "a.b.c": "deeper", "a.b": "leaf" })).toThrow(
      'Catalog key "a.b" is a leaf but already exists as a branch',
    );
  });

  it("exposes the pos namespace constant templates rely on", () => {
    expect(POS_NAMESPACE).toBe("pos");
  });
});
