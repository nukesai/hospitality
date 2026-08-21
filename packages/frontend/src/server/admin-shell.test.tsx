/**
 * getTranslations is mocked with a use-intl core translator over the REAL
 * derived catalogs (the react-client shim vitest resolves would throw). The
 * genuine react-server wiring is covered by the example app build + E2E.
 */
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", async () => {
  const { en } = await import("../locales/en.js");
  const { ne } = await import("../locales/ne.js");
  const catalogs: Record<string, Record<string, unknown>> = {
    en: en as unknown as Record<string, unknown>,
    ne: ne as unknown as Record<string, unknown>,
  };
  return {
    // Namespace scoping emulated by handing the translator the sub-tree —
    // createTranslator's `namespace` param is typed off the (absent) AppConfig
    // augmentation, which a library test must not declare.
    getTranslations: async (options: { locale: string; namespace?: string }) => {
      const catalog = catalogs[options.locale] ?? catalogs.en ?? {};
      const messages = options.namespace === undefined ? catalog : catalog[options.namespace];
      return Promise.resolve(
        createTranslator({ locale: options.locale, messages: messages as Record<string, string> }),
      );
    },
  };
});

import { PosAdminShell } from "./admin-shell.js";

describe("PosAdminShell", () => {
  it("renders the localized dashboard by default", async () => {
    render(await PosAdminShell({ locale: "en" }));
    expect(screen.getByRole("heading", { name: "Nukes POS Admin" })).toBeInTheDocument();
    expect(screen.getByTestId("admin-welcome")).toHaveTextContent("Welcome to your POS.");
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/admin/orders");
  });

  it("routes segments package-side and translates them (ne orders)", async () => {
    render(await PosAdminShell({ locale: "ne", segments: ["orders"], basePath: "/x/admin" }));
    expect(screen.getByTestId("admin-orders-empty")).toHaveTextContent("अहिलेसम्म कुनै अर्डर छैन।");
    expect(screen.getByRole("link", { name: "ड्यासबोर्ड" })).toHaveAttribute("href", "/x/admin");
  });

  it("renders children instead of the built-in section when provided", async () => {
    render(
      await PosAdminShell({ locale: "en", children: <p data-testid="custom">custom pane</p> }),
    );
    expect(screen.getByTestId("custom")).toHaveTextContent("custom pane");
    expect(screen.queryByTestId("admin-welcome")).not.toBeInTheDocument();
  });
});
