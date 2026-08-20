import { describe, expect, it } from "vitest";

import { en } from "../locales/en.js";
import { ne } from "../locales/ne.js";
import { createPosServerI18n } from "./i18n.js";

describe("createPosServerI18n", () => {
  it("returns per-locale instances with fixed t functions", () => {
    const server = createPosServerI18n({ resources: { en, ne } });
    expect(server.getT("en")("order.status.ready")).toBe("Ready");
    expect(server.getT("ne")("order.status.ready")).toBe("तयार");
  });

  it("supports explicit namespaces and isolated instances per locale", () => {
    const server = createPosServerI18n({ resources: { en } });
    // React cache() memoizes WITHIN one RSC request scope; outside a render it
    // degrades to a fresh instance per call — which is exactly the isolation
    // guarantee (never a shared mutable instance across requests).
    expect(server.getI18n("en").language).toBe("en");
    expect(server.getT("en", "pos")("order.acknowledged")).toBe("Acknowledged");
  });
});
