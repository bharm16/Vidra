import { expect, test } from "@playwright/test";

test.describe("marketing pages render correctly", () => {
  test("home redirects to the workspace front door", async ({ page }) => {
    // ADR-0010 site-scope (D9/D10): the input at "/" is the only front door —
    // /home parks on "/".
    await page.goto("/home");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Shot description")).toBeVisible();
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
});
