import { expect, test, type Page } from "@playwright/test";

/**
 * Golden path — the walkthrough that defines a working product (CONTEXT.md):
 * empty canvas → creator submits a one-liner → expansion → first frame
 * (explicit gate) → motion → render → a clip the creator can watch and keep.
 *
 * Unlike the other e2e specs, this one mocks NOTHING. It runs the real
 * client against the real server and real LLM providers, because its job is
 * to catch exactly the class of failure unit tests cannot: isolated-green,
 * integrated-broken.
 *
 * Tier 1 (always on) covers the authoring loop with zero generation spend:
 * anonymous fresh load → expansion → session URL → refresh-safe persistence.
 *
 * Tier 2 (GOLDEN_PATH_FULL=1) adds the first-frame leg (real Replicate +
 * GCS storage). Off by default: it spends real money per run and requires
 * healthy storage credentials.
 */

const ONE_LINER = "a lighthouse keeper reading by lamplight during a storm";

const editorText = async (page: Page): Promise<string> => {
  const editor = page.getByLabel("Shot description");
  return (await editor.textContent()) ?? "";
};

test.describe("golden path", () => {
  test("a one-line idea expands into a session that survives refresh", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Fresh anonymous load shows the empty-canvas hero.
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "What are you making?" }),
    ).toBeVisible();

    // Creator types a one-liner and submits.
    const editor = page.getByLabel("Shot description");
    await editor.fill(ONE_LINER);
    await page.getByTestId("canvas-generate-button").click();

    // Expansion lands the creator on a session URL...
    await page.waitForURL((url) => url.pathname.startsWith("/session/"), {
      timeout: 60_000,
    });
    const sessionUrl = page.url();

    // ...with a genuinely expanded prompt in the canvas: not an echo of the
    // input, and materially richer. (The 2026-07-01 audit caught the silent
    // template fallback returning the input verbatim as success.)
    await expect
      .poll(async () => (await editorText(page)).length, { timeout: 60_000 })
      .toBeGreaterThan(ONE_LINER.length * 2);
    const expanded = await editorText(page);
    expect(expanded).not.toBe(ONE_LINER);

    // Refresh must not lose the creator's work (UX rule #1). The audit
    // caught an infinite "Loading prompt…" spinner here.
    await page.reload();
    await expect
      .poll(async () => await editorText(page), { timeout: 30_000 })
      .toBe(expanded);
    expect(page.url()).toBe(sessionUrl);

    // The session is restorable from the Sessions panel.
    await page.getByRole("button", { name: "Sessions" }).click();
    await expect(
      page.getByRole("button", { name: /^Load prompt:/ }).first(),
    ).toBeVisible();
  });

  test("expansion produces a first frame", async ({ page }) => {
    test.skip(
      !process.env.GOLDEN_PATH_FULL,
      "Set GOLDEN_PATH_FULL=1 to run the paid first-frame leg (needs healthy GCS + Replicate).",
    );
    test.setTimeout(240_000);

    await page.goto("/");
    const editor = page.getByLabel("Shot description");
    await editor.fill(ONE_LINER);

    const frameResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/preview/generate") &&
        response.request().method() === "POST",
      { timeout: 180_000 },
    );
    await page.getByTestId("canvas-generate-button").click();

    // The frame request must succeed — and the UI must not show the
    // frame-failure state the audit hit.
    const response = await frameResponse;
    expect(response.status()).toBe(200);
    await expect(page.getByText("Couldn’t create a frame")).toHaveCount(0);
  });
});
