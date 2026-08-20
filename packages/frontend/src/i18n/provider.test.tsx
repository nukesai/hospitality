import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTranslations } from "next-intl";

import { en } from "../locales/en.js";
import { PosIntlProvider } from "./provider.js";

function Probe(): React.ReactElement {
  const t = useTranslations("pos");
  return (
    <>
      <p data-testid="known">{t("order.status.ready")}</p>
      <p data-testid="param">{t("order.total", { amount: "€5.00" })}</p>
      <p data-testid="missing">{t("does.not.exist")}</p>
    </>
  );
}

describe("PosIntlProvider", () => {
  it("resolves dotted paths over the nested catalog with ICU params", () => {
    render(
      <PosIntlProvider locale="en" messages={en}>
        <Probe />
      </PosIntlProvider>,
    );
    expect(screen.getByTestId("known")).toHaveTextContent("Ready");
    expect(screen.getByTestId("param")).toHaveTextContent("Total: €5.00");
  });

  it("falls back to the dotted key on missing messages instead of crashing (engine parity)", () => {
    render(
      <PosIntlProvider locale="en" messages={en}>
        <Probe />
      </PosIntlProvider>,
    );
    expect(screen.getByTestId("missing")).toHaveTextContent("does.not.exist");
  });
});
