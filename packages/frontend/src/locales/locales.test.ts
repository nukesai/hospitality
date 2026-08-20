import { en as commonEn } from "@nukesai-pos/common/i18n/locales/en";
import { ne as commonNe } from "@nukesai-pos/common/i18n/locales/ne";
import { describe, expect, it } from "vitest";

import { en } from "./en.js";
import { ne } from "./ne.js";

describe("frontend locales derive from common (single source of truth)", () => {
  it("en is exactly the common catalog under the pos namespace", () => {
    expect(en.pos).toBe(commonEn);
  });

  it("ne is exactly the common catalog under the pos namespace", () => {
    expect(ne.pos).toBe(commonNe);
  });

  it("every locale carries every key of the en contract", () => {
    for (const key of Object.keys(en.pos)) {
      expect(ne.pos[key as keyof typeof ne.pos]).toBeTruthy();
    }
  });
});
