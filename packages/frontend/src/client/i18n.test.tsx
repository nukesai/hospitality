import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { en } from "../locales/en.js";
import { ne } from "../locales/ne.js";
import { PosI18nProvider, useTranslation } from "./i18n.js";

function Probe(): ReturnType<typeof Label> {
  return <Label />;
}

function Label(): React.ReactElement {
  const { t } = useTranslation();
  return <p>{t("order.acknowledge")}</p>;
}

describe("PosI18nProvider", () => {
  it("provides translations to client leaves", () => {
    render(
      <PosI18nProvider lng="en" resources={{ en }}>
        <Probe />
      </PosI18nProvider>,
    );
    expect(screen.getByText("Acknowledge")).toBeInTheDocument();
  });

  it("switches language in place when lng changes", () => {
    const { rerender } = render(
      <PosI18nProvider lng="en" resources={{ en, ne }}>
        <Probe />
      </PosI18nProvider>,
    );
    expect(screen.getByText("Acknowledge")).toBeInTheDocument();
    rerender(
      <PosI18nProvider lng="ne" resources={{ en, ne }}>
        <Probe />
      </PosI18nProvider>,
    );
    expect(screen.getByText("स्वीकार गर्नुहोस्")).toBeInTheDocument();
  });
});
