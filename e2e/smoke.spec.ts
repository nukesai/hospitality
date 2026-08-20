import { expect, test } from "@playwright/test";

test("example app serves the demo page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /nukes pos/i })).toBeVisible();
});
