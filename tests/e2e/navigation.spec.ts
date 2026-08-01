import { expect, test } from "@playwright/test";

test.describe("route redirects and 404", () => {
  test("/login redirects to /signin", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("/register redirects to /signup", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/signup/);
  });

  test("/support redirects to /contact", async ({ page }) => {
    await page.goto("/support");
    await expect(page).toHaveURL(/\/contact/);
  });

  test("/billing parks on the workspace while billing is frozen", async ({
    page,
  }) => {
    // BILLING_UI defaults off (ADR-0002 frozen stack): /billing and
    // /settings/billing both redirect to "/" until the subscription rewrite.
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/$/);
  });

  test("unknown route shows 404 page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-e2e");
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});
