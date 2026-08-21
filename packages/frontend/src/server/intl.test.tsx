import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next-intl/server resolves to its react-client shim under vitest (it throws by
// design outside the react-server condition), so the boundary is mocked here.
const setRequestLocale = vi.fn();
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: string): void => {
    setRequestLocale(locale);
  },
}));

import { useTranslations } from "next-intl";
import { en } from "../locales/en.js";
import { PosIntl } from "./intl.js";

function Probe(): React.ReactElement {
  const t = useTranslations("pos");
  return (
    <>
      <p data-testid="known">{t("order.status.ready")}</p>
      <p data-testid="missing">{t("nope.nothing")}</p>
    </>
  );
}

describe("PosIntl", () => {
  it("zero-prop form requires the server inheritance (client render throws)", () => {
    // In a plain client render there is no request config to inherit from —
    // the example app's build+e2e cover the real react-server path. The message
    // is pinned so a crash inside our own composition cannot masquerade as it.
    expect(() => {
      render(
        <PosIntl>
          <p>x</p>
        </PosIntl>,
      );
    }).toThrow(/Couldn't infer the `locale` prop/);
  });

  it("primes the request locale so the subtree can render statically", () => {
    // Without this, every locale-less next-intl server API below falls back to
    // reading request headers, which opts the whole page tree out of SSG
    // (measured: `f /[locale]` before, `● /en` after).
    setRequestLocale.mockClear();
    render(
      <PosIntl locale="ne" messages={en as unknown as Record<string, unknown>}>
        <p>x</p>
      </PosIntl>,
    );
    expect(setRequestLocale).toHaveBeenCalledWith("ne");
  });

  it("does not prime when no locale is given (cookie-negotiated apps)", () => {
    setRequestLocale.mockClear();
    expect(() => {
      render(
        <PosIntl>
          <p>x</p>
        </PosIntl>,
      );
    }).toThrow();
    expect(setRequestLocale).not.toHaveBeenCalled();
  });

  it("provides messages to client hooks and keeps the POS key fallback", () => {
    // Explicit props here: the zero-prop path needs next-intl's react-server
    // build (exercised by the example app build + e2e).
    render(
      <PosIntl locale="en" messages={en as unknown as Record<string, unknown>}>
        <Probe />
      </PosIntl>,
    );
    expect(screen.getByTestId("known")).toHaveTextContent("Ready");
    expect(screen.getByTestId("missing")).toHaveTextContent("nope.nothing");
  });
});
