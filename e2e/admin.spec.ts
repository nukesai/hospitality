import { expect, test } from "@playwright/test";

// The admin shell: ONE consumer route file, sections + i18n handled by
// @nukesai-pos/frontend (PosAdminShell). No stack needed — shell is static.
test.describe("admin shell", () => {
  test("renders the localized dashboard at /admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Nukes POS Admin" })).toBeVisible();
    await expect(page.getByTestId("admin-welcome")).toHaveText("Welcome to your POS.");
    await expect(page.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
  });

  test("routes sections package-side and localizes them (ne)", async ({ page }) => {
    await page.goto("/ne/admin/orders");
    await expect(page.getByTestId("pos-admin-shell")).toBeVisible();
    await expect(page.getByTestId("admin-orders-empty")).toHaveText("अहिलेसम्म कुनै अर्डर छैन।");
    await expect(page.getByRole("link", { name: "ड्यासबोर्ड" })).toHaveAttribute(
      "href",
      "/ne/admin",
    );
  });

  test("unknown locales 404 instead of leaking the default", async ({ page }) => {
    const response = await page.goto("/fr/admin");
    expect(response?.status()).toBe(404);
  });
});
