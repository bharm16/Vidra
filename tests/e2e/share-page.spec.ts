import { expect, test } from "@playwright/test";
import { jsonResponse } from "./helpers/responses";

/**
 * Public clip page (ADR-0010 site-scope D8). The share surface is a logged-out
 * growth loop: a shared clip renders as the cinematic hero with its paired
 * description and a "start your own" CTA. It fetches the public endpoint
 * /api/public/share/:shareId and validates a {success, data} envelope at the
 * wire (client/src/features/share/api/publicClipApi.ts).
 */
test.describe("share page", () => {
  test("displays the shared clip with description and CTA", async ({
    page,
  }) => {
    const shareId = "e2e-share-clip-123";

    await page.route(`**/api/public/share/${shareId}`, async (route) => {
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            videoUrl: "https://example.com/clips/sunset.mp4",
            description:
              "A breathtaking golden sunset over a calm ocean, cinematic wide shot.",
            model: "sora-2",
            createdAt: "2026-02-01T12:00:00.000Z",
          },
        }),
      );
    });

    await page.goto(`/share/${shareId}`);

    // The clip is the hero: a video player with the shared source.
    await expect(page.locator("video")).toBeVisible({ timeout: 10000 });

    // The paired description renders as the caption.
    await expect(
      page.getByText(/a breathtaking golden sunset over a calm ocean/i),
    ).toBeVisible();

    // The growth-loop CTA links back to the workspace front door.
    const cta = page.getByRole("link", { name: /start your own clip/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");
  });

  test("displays the not-found state for an unknown share id", async ({
    page,
  }) => {
    const badId = "nonexistent-share-id";

    await page.route(`**/api/public/share/${badId}`, async (route) => {
      await route.fulfill(
        jsonResponse({ success: false, error: "Share not found" }, 404),
      );
    });

    await page.goto(`/share/${badId}`);

    await expect(
      page.getByRole("heading", { name: /clip not found/i }),
    ).toBeVisible({ timeout: 10000 });
    // The not-found state keeps the growth loop alive with the same CTA.
    await expect(
      page.getByRole("link", { name: /start your own clip/i }),
    ).toBeVisible();
  });
});
