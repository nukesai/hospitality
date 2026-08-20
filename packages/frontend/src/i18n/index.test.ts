import { describe, expect, it } from "vitest";

import { en } from "../locales/en.js";
import { ne } from "../locales/ne.js";
import { createPosI18n, mergePosResources, POS_DEFAULT_NS } from "./index.js";

describe("createPosI18n", () => {
  it("initializes synchronously with injected resources", () => {
    const i18n = createPosI18n({ lng: "en", resources: { en } });
    expect(i18n.t("order.acknowledge")).toBe("Acknowledge");
    expect(i18n.language).toBe("en");
  });

  it("uses single-brace interpolation — the SAME syntax as common's catalogs", () => {
    const i18n = createPosI18n({ lng: "en", resources: { en } });
    expect(i18n.t("order.total", { amount: "€10.50" })).toBe("Total: €10.50");
  });

  it("falls back to en for missing keys in other locales and honours overrides", () => {
    const i18n = createPosI18n({
      lng: "ne",
      resources: { en, ne },
      fallbackLng: "en",
      defaultNS: POS_DEFAULT_NS,
    });
    expect(i18n.t("order.status.ready")).toBe("तयार");
  });

  it("respects custom fallback and namespace options", () => {
    const i18n = createPosI18n({
      lng: "xx",
      fallbackLng: "ne",
      resources: { ne },
      defaultNS: "pos",
    });
    expect(i18n.t("order.acknowledged")).toBe("स्वीकार गरियो");
  });
});

describe("mergePosResources", () => {
  it("deep-merges with override winning per leaf key", () => {
    const merged = mergePosResources({ en }, { en: { pos: { "order.total": "Sum: {amount}" } } });
    const pos = (merged.en as { pos: Record<string, string> }).pos;
    expect(pos["order.total"]).toBe("Sum: {amount}");
    expect(pos["order.acknowledge"]).toBe("Acknowledge");
  });

  it("replaces non-record leaves and adds new branches", () => {
    const merged = mergePosResources(
      { en: { pos: { a: "1" } } },
      { en: { extra: { b: "2" } }, fr: { pos: { a: "un" } } },
    );
    expect((merged.en as Record<string, unknown>).extra).toEqual({ b: "2" });
    expect((merged.fr as { pos: { a: string } }).pos.a).toBe("un");
  });

  it("arrays are treated as leaves (replaced, not merged)", () => {
    const merged = mergePosResources(
      { en: { pos: { list: ["a"] } } },
      { en: { pos: { list: ["b"] } } },
    );
    expect((merged.en as { pos: { list: string[] } }).pos.list).toEqual(["b"]);
  });
});
