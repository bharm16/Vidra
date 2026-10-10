import { expect, test } from "@playwright/test";

test.describe("auth pages", () => {
  test("sign-in shows error when submitting empty form", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /sign in/i }).click();
    // The form validation shows "Enter your email and password."
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText("Enter your email and password")).toBeVisible();
  });
});
