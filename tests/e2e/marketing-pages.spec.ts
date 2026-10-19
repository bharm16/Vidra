import { expect, test } from "@playwright/test";

test.describe("public pages and workspace entry", () => {
  test("home redirects to the public front door with independent creation choices", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Images, clips,.*finished videos/i, level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Images", exact: false })).toBeVisible();
    await expect(page.getByLabel("Shot description")).toHaveCount(0);
  });

  test("a public clip capability retains its intent through the sign-in gate", async ({ page }) => {
    await page.goto("/product/video");
    await page.getByRole("main").getByRole("link", { name: "Start creating", exact: true }).click();
    await expect(page).toHaveURL(/\/app\?intent=make-video$/);
    await expect(page.getByRole("heading", { name: "Keep your work in a project." })).toBeVisible();
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("form", { name: "Sign in", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/app?intent=make-video");
  });

  test("docs search opens an exact guide and keeps its query", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "Make the most of Vidra.", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /Search documentation/ }).click();
    await page.getByRole("textbox", { name: "Search documentation" }).fill("export");
    await page.getByRole("dialog").getByRole("link", { name: "Assemble and export a video", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/editor\?q=export$/);
    await expect(page.getByRole("heading", { name: "Assemble and export a video", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Export a saved cut", level: 2 })).toBeVisible();
  });
});
