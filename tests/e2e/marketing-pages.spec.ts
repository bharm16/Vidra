import { expect, test } from "@playwright/test";

test.describe("public pages and workspace entry", () => {
  test("home redirects to the public front door with independent creation choices", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Images, clips,.*finished videos/i, level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Images", exact: false })).toBeVisible();
    await expect(page.getByLabel("Shot description")).toHaveCount(0);
  });

  test("a public clip capability opens a signed-out composer that keeps its words through sign-up", async ({ page }) => {
    await page.goto("/product/video");
    await page.getByRole("main").getByRole("link", { name: "Start creating", exact: true }).click();
    await expect(page).toHaveURL(/\/app\?intent=make-video$/);
    const words = page.getByLabel("Current request words", { exact: true });
    await expect(words).toHaveAttribute("placeholder", "Describe your video…");
    await words.fill("Waves breaking at night");
    await page.getByRole("button", { name: "Reference", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?redirect=/);
    const redirect = new URL(page.url()).searchParams.get("redirect") ?? "";
    expect(redirect).toMatch(/^\/app\?claim=guest_/);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("vidra-guest-draft/v1") ?? "null") as { id: string; action: string; instructions: string } | null);
    expect(kept).toMatchObject({ action: "make-video", instructions: "Waves breaking at night" });
    expect(redirect).toBe(`/app?claim=${kept?.id}`);
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
