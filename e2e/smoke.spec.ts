import { expect, test } from "@playwright/test";

test("example app serves the demo page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /nukes pos/i })).toBeVisible();
});

test("client bundle hydrates: OrderTicket is interactive", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");
  // Clicking exercises the "use client" leaf end-to-end: the handler only runs
  // after hydration, so a broken/missing client bundle fails here.
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByRole("button", { name: "Acknowledged" })).toBeDisabled();
  expect(pageErrors).toEqual([]);
});
