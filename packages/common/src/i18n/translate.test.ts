import { describe, expect, it } from "vitest";

import { en } from "./locales/en.js";
import { ne } from "./locales/ne.js";
import { createTranslator } from "./translate.js";

describe("createTranslator", () => {
  it("returns the message for a known key", () => {
    const { t } = createTranslator(en);
    expect(t("order.status.pending")).toBe("Pending");
  });

  it("falls back to the key when the message is missing", () => {
    const { t } = createTranslator(en);
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("interpolates params", () => {
    const { t } = createTranslator(en);
    expect(t("order.total", { amount: "€12.00" })).toBe("Total: €12.00");
  });

  it("leaves unknown placeholders intact", () => {
    const { t } = createTranslator({ greet: "Hi {name} {missing}" });
    expect(t("greet", { name: "Asha" })).toBe("Hi Asha {missing}");
  });

  it("translates the Nepali locale", () => {
    const { t } = createTranslator(ne);
    expect(t("order.status.ready")).toBe("तयार");
  });
});
