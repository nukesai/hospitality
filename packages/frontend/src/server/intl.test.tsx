import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
