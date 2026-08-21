import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTranslations } from "next-intl";

import { en } from "../locales/en.js";
import { PosIntlProvider, type PosIntlProviderProps } from "./provider.js";

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

  it("inherits locale+messages from the ancestor provider (nested PosIntl composition)", () => {
    render(
      <PosIntlProvider locale="en" messages={en}>
        <PosIntlProvider>
          <Probe />
        </PosIntlProvider>
      </PosIntlProvider>,
    );
    expect(screen.getByTestId("known")).toHaveTextContent("Ready");
  });

  it("inherits even when the caller passes locale={undefined} explicitly", () => {
    // next-intl's client provider throws "Couldn't infer the `locale` prop"
    // BEFORE merging ancestor context, so an own `locale: undefined` key must
    // never survive into it — a conditional `locale={props.locale}` is the
    // natural consumer pattern.
    // Consumer apps run WITHOUT exactOptionalPropertyTypes (Next's default),
    // where `locale={session?.locale}` type-checks and lands here.
    const explicitUndefined = { locale: undefined } as unknown as PosIntlProviderProps;
    render(
      <PosIntlProvider locale="en" messages={en}>
        <PosIntlProvider {...explicitUndefined}>
          <Probe />
        </PosIntlProvider>
      </PosIntlProvider>,
    );
    expect(screen.getByTestId("known")).toHaveTextContent("Ready");
  });
});
