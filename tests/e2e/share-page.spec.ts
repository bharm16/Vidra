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

/** Immutable workflow grants have their own URL namespace; revocation can
 * never fall through to a saved legacy share with a colliding UUID. */
test.describe("workflow exact-version public links", () => {
  const shareId = "c89cd429-b254-4faa-af41-c237ab92315b";

  test("a canonical shared picture is cleared after access is revoked", async ({ page, baseURL }) => {
    let revoked = false;
    let legacyReads = 0;
    await page.route("**/api/public/share/**", async route => { legacyReads += 1; await route.fulfill(jsonResponse({ error: "Legacy lookup must not run" }, 404)); });
    await page.route(`**/api/public/workflow-shares/${shareId}`, async route => {
      if (revoked) { await route.fulfill(jsonResponse({ error: "Unavailable" }, 404)); return; }
      await route.fulfill(jsonResponse({ success: true, data: { id: shareId, kind: "image", label: "One shared picture", url: new URL(`/api/public/workflow-shares/${shareId}/content`, baseURL).href, createdAt: "2026-10-17T00:00:00.000Z", expiresAt: new Date(Date.now() + 60000).toISOString() } }));
    });
    await page.route(`**/api/public/workflow-shares/${shareId}/content`, async route => {
      await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    });
    await page.goto(`/share/media/${shareId}`);
    await expect(page.getByRole("img", { name: "One shared picture" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reuse setup", exact: true })).toHaveCount(0);
    revoked = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("heading", { name: "This link is no longer available" })).toBeVisible();
    await expect(page.getByRole("img", { name: "One shared picture" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(0);
    expect(legacyReads).toBe(0);
  });

  test("an unavailable canonical link does not resolve through the legacy namespace", async ({ page }) => {
    let legacyReads = 0;
    await page.route("**/api/public/share/**", async route => { legacyReads += 1; await route.fulfill(jsonResponse({ success: true, data: { videoUrl: "https://example.com/legacy.mp4", description: "A different legacy target", model: "legacy", createdAt: "2026-10-17T00:00:00.000Z" } })); });
    await page.route(`**/api/public/workflow-shares/${shareId}`, async route => { await route.fulfill(jsonResponse({ error: "Unavailable" }, 404)); });
    await page.goto(`/share/media/${shareId}`);
    await expect(page.getByRole("heading", { name: "This link is no longer available" })).toBeVisible();
    await expect(page.getByText("A different legacy target", { exact: true })).toHaveCount(0);
    expect(legacyReads).toBe(0);
  });
});
