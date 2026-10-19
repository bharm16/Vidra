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

  test("unknown route shows 404 page", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-e2e");
    await expect(page.getByRole("heading", { name: "We could not find that page", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go home", exact: true })).toHaveAttribute("href", "/");
  });
});


test("a guest cannot read a private project before authentication", async ({ page }) => {
  let projectReads = 0;
  await page.route("**/api/projects/**", async route => { projectReads += 1; await route.fulfill({ status: 403, json: { error: "Denied" } }); });
  await page.goto("/app/project/project_private?view=media");
  await expect(page.getByRole("heading", { name: "You do not have access" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Switch account", exact: true })).toHaveAttribute("href", `/signin?redirect=${encodeURIComponent("/app/project/project_private?view=media")}`);
  expect(projectReads).toBe(0);
});
