import { expect, test } from "@playwright/test";

test.describe("marketing pages render correctly", () => {
  test("home redirects to the workspace front door", async ({ page }) => {
    // ADR-0010 site-scope (D9/D10): the input at "/" is the only front door —
    // /home parks on "/".
    await page.goto("/home");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Shot description")).toBeVisible();
  });

  test("pricing redirects to the workspace while billing is frozen", async ({
    page,
  }) => {
    // BILLING_UI defaults off (ADR-0002 frozen stack) — /pricing parks on "/"
    // until the subscription rewrite.
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/$/);
  });

  test("docs page displays documentation sections", async ({ page }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("heading", { name: /how it works/i, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^the workflow$/i, level: 2 }),
    ).toBeVisible();
  });

  test("privacy policy page renders legal variant", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("terms of service page renders legal variant", async ({ page }) => {
    await page.goto("/terms-of-service");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("contact/support page renders", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
