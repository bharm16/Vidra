import { expect, test, type Page } from "@playwright/test";
import { injectAuthUser } from "./helpers/auth";

/**
 * Golden path — the walkthrough that defines a working product (CONTEXT.md):
 * empty canvas → creator submits a one-liner → expansion → first frame
 * (explicit gate) → motion → render → a clip the creator can watch and keep.
 *
 * Unlike the other e2e specs, this one mocks NOTHING on the network. It runs
 * the real client against the real server and real LLM providers, because its
 * job is to catch exactly the class of failure unit tests cannot:
 * isolated-green, integrated-broken. The only seam is injectAuthUser, which
 * swaps the client-side auth repository — generation is sign-in-gated for
 * guests, and the wire still authenticates via the dev API key fallback.
 *
 * Tier 1 (always on) covers the guest gate plus the authed authoring loop
 * with zero generation spend: expansion → session URL → refresh-safe
 * persistence.
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
  test("a guest submit is sign-in-gated and preserves the prompt", async ({
    page,
  }) => {
    // Fresh anonymous load shows the empty canvas anchored on the shot input.
    // (The "What are you making?" hero was removed in the ADR-0010 rebuild —
    // the anchor input IS the empty state.)
    await page.goto("/");
    const editor = page.getByLabel("Shot description");
    await expect(editor).toBeVisible();
    await editor.fill(ONE_LINER);
    await page.getByTestId("canvas-generate-button").click();

    // Guests don't generate: the submit opens the sign-in gate instead
    // (RequireAuth sweep, 6ace8f7b era) — and closing it must not lose the
    // creator's words (UX rule #1).
    const gate = page.getByRole("dialog", { name: "Sign in to make it" });
    await expect(gate).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(gate).toHaveCount(0);
    await expect.poll(async () => await editorText(page)).toContain(ONE_LINER);
  });

  test("a one-line idea expands into a session that survives refresh", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await injectAuthUser(page);
    await page.goto("/");
    const editor = page.getByLabel("Shot description");
    await expect(editor).toBeVisible();
    await editor.fill(ONE_LINER);
    await page.getByTestId("canvas-generate-button").click();

    // The canvas stage narrates the loop from the first beat — the frame
    // (or its pending/failed state) owns the canvas, never a blank void.
    await expect(page.getByTestId("frame-stage")).toBeVisible({
      timeout: 15_000,
    });

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

    // The session is restorable from the Library — the archive surface that
    // replaced the Sessions panel in the ADR-0010 rebuild.
    await page.getByRole("link", { name: "Library" }).first().click();
    await expect(page).toHaveURL(/\/history/);
    await expect(
      page.getByLabel(/^Open session: .*lighthouse/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("the expanded words grow labeled spans, and click-to-enhance applies a real suggestion", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // The enhancement leg is the historically fragile half of the loop —
    // the 2026-07-31 launch-blocker (c3f17e15) was streaming span labeling
    // silently returning empty while every mocked suite stayed green. This
    // test runs the real labeler and the real suggestions pipeline, on its
    // own one-liner so server-side optimize/label caches keyed by input
    // never mask the cold path.
    const ENHANCE_LINER = "a clockmaker winding a brass clock by candlelight";
    await injectAuthUser(page);
    await page.goto("/");
    const editor = page.getByLabel("Shot description");
    await expect(editor).toBeVisible();
    await editor.fill(ENHANCE_LINER);
    await page.getByTestId("canvas-generate-button").click();

    // Expansion lands on a session and the working words grow labeled spans
    // from the real streaming labeler.
    await page.waitForURL((url) => url.pathname.startsWith("/session/"), {
      timeout: 60_000,
    });
    // 90s: a fully cold local suite run (three concurrent expansions +
    // Replicate frames on unbounded workers) pushed cold labeling past 60s;
    // the signal here is "labels arrive at all", not their latency.
    const firstSpan = page.locator("[data-category]").first();
    await expect(firstSpan).toBeVisible({ timeout: 90_000 });

    // Click-to-enhance: selecting a span opens the suggestion tray...
    await firstSpan.click();
    const tray = page.getByTestId("canvas-suggestion-tray");
    await expect(tray).toBeVisible({ timeout: 10_000 });

    // ...which fills with real alternatives (live LLM latency)...
    const firstSuggestion = tray.locator("button[data-index]").first();
    await expect(firstSuggestion).toBeVisible({ timeout: 45_000 });
    // The suggestion text is the button's first text node (the "Best" badge
    // is a trailing span).
    const suggestionText = (
      await firstSuggestion.evaluate(
        (el) => el.childNodes[0]?.textContent ?? "",
      )
    ).trim();
    expect(suggestionText.length).toBeGreaterThan(0);

    // ...and applying one lands it in the working words.
    await firstSuggestion.click();
    await expect
      .poll(async () => await editorText(page), { timeout: 15_000 })
      .toContain(suggestionText);
  });

  test("expansion produces a first frame", async ({ page }) => {
    test.skip(
      !process.env.GOLDEN_PATH_FULL,
      "Set GOLDEN_PATH_FULL=1 to run the paid first-frame leg (needs healthy GCS + Replicate).",
    );
    test.setTimeout(240_000);

    await injectAuthUser(page);
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

    // The stage must actually show the frame, not just avoid the error copy.
    await expect(page.getByTestId("frame-stage").locator("img")).toBeVisible({
      timeout: 120_000,
    });
  });

  test("the frame becomes a playable clip (motion + render leg)", async ({
    page,
  }) => {
    test.skip(
      !process.env.GOLDEN_PATH_RENDER,
      "Set GOLDEN_PATH_RENDER=1 to run the paid render leg (draft-model video via the preview passthrough).",
    );
    test.setTimeout(720_000);

    await injectAuthUser(page);
    await page.goto("/");
    const editor = page.getByLabel("Shot description");
    await editor.fill(ONE_LINER);
    await page.getByTestId("canvas-generate-button").click();

    // Expansion + first frame must land before the render beat.
    await expect(page.getByTestId("frame-stage").locator("img")).toBeVisible({
      timeout: 240_000,
    });

    // The motion beat: the canvas holds the I2V description that will drive
    // the render — materially richer than the one-liner, not an echo.
    const motionDescription = await editorText(page);
    expect(motionDescription.length).toBeGreaterThan(ONE_LINER.length * 2);

    // ADR-0002: validation-phase generation is a hard-capped passthrough on
    // our dime. Generation is sign-in-gated (guest gate above), but for a
    // signed-in creator the render CTA must be ENABLED — if the frozen credit
    // gate blocks it, that is a product failure this spec exists to catch
    // (2026-07-01 audit, finding 10).
    const renderButton = page.getByTestId("canvas-generate-button");
    await expect(renderButton).toBeEnabled();

    const renderRequest = page.waitForResponse(
      (response) =>
        response.url().includes("/api/preview") &&
        response.request().method() === "POST",
      { timeout: 120_000 },
    );
    await renderButton.click();
    const renderResponse = await renderRequest;
    expect(renderResponse.status()).toBeLessThan(300);

    // Definition of done, verbatim from the audit: the creator gets a clip
    // they can watch. A rendered <video> with a real source, end to end.
    const clip = page.locator("video[src], video source[src]").first();
    await expect(clip).toBeVisible({ timeout: 600_000 });
  });
});
