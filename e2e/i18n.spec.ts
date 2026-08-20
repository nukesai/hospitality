import { expect, test } from "@playwright/test";

const STACK = process.env.E2E_STACK === "1";

test.describe("localization (server + client rendered)", () => {
  test.skip(!STACK, "E2E_STACK=1 required (server boots against the stack)");

  test("English locale renders server and client translations", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("server-translated")).toHaveText("Ready");
    await expect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
  });

  test("Nepali locale renders both graphs translated and hydrated", async ({ page }) => {
    await page.goto("/ne");
    await expect(page.getByTestId("server-translated")).toHaveText("तयार");
    const button = page.getByRole("button", { name: "स्वीकार गर्नुहोस्" });
    await button.click();
    await expect(page.getByRole("button", { name: "स्वीकार गरियो" })).toBeDisabled();
  });
});
