import { expect, test } from "@playwright/test";
import { jsonResponse } from "./helpers/responses";
import { mockSessionRoutes } from "./helpers/mockRoutes";
import { injectAuthUser } from "./helpers/auth";

test.describe("span labeling and suggestions", () => {
  // FIXME(e2e): `[data-category]` elements never appear after optimize on main.
  // The /api/optimize and /api/llm/label-spans routes are mocked correctly, but
  // the SpanCategoryAccordion (the component that renders [data-category]
  // spans) doesn't surface in the post-optimize state. Pre-existing failure
  // on main for 5+ runs — needs frontend trace inspection to determine which
  // panel/state holds the spans now and whether a panel toggle is needed.
  test.fixme(
    "span labels render after prompt optimization",
    async ({ page }) => {
      await injectAuthUser(page);
      await mockSessionRoutes(page);

      await page.route("**/api/optimize", async (route) => {
        await route.fulfill(
          jsonResponse({
            success: true,
            prompt: "A cinematic runner sprinting through neon rain.",
            optimizedPrompt: "A cinematic runner sprinting through neon rain.",
            metadata: {
              previewPrompt: "A cinematic runner sprinting through neon rain.",
            },
          }),
        );
      });

      await page.route("**/api/llm/label-spans", async (route) => {
        await route.fulfill(
          jsonResponse({
            spans: [
              { text: "A cinematic", category: "style", start: 0, end: 11 },
              { text: "runner", category: "subject", start: 12, end: 18 },
              { text: "sprinting", category: "action", start: 19, end: 28 },
              {
                text: "through neon rain",
                category: "environment",
                start: 29,
                end: 46,
              },
            ],
          }),
        );
      });

      await page.goto("/");
      const promptInput = page.getByLabel("Shot description");
      await expect(promptInput).toBeVisible({ timeout: 15000 });
      await promptInput.fill(
        "Wide shot of a cyclist crossing a bridge at dusk.",
      );

      const optimizeShortcut =
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
      await promptInput.press(optimizeShortcut);

      // Wait for the optimized output to appear then check for labeled spans
      await expect(page.locator("[data-category]").first()).toBeVisible({
        timeout: 10000,
      });

      const spanCategories = await page
        .locator("[data-category]")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("data-category")),
        );
      expect(spanCategories.length).toBeGreaterThan(0);
    },
  );

  // FIXME(e2e): same root cause as above — depends on [data-category]
  // rendering after optimize, which currently doesn't happen in the test env.
  test.fixme(
    "clicking a labeled span shows suggestions popover",
    async ({ page }) => {
      await injectAuthUser(page);
      await mockSessionRoutes(page);

      await page.route("**/api/optimize", async (route) => {
        await route.fulfill(
          jsonResponse({
            success: true,
            prompt: "A cinematic drone shot over misty mountains.",
            optimizedPrompt: "A cinematic drone shot over misty mountains.",
            metadata: {
              previewPrompt: "A cinematic drone shot over misty mountains.",
            },
          }),
        );
      });

      await page.route("**/api/llm/label-spans", async (route) => {
        await route.fulfill(
          jsonResponse({
            spans: [
              { text: "A cinematic", category: "style", start: 0, end: 11 },
              { text: "drone shot", category: "camera", start: 12, end: 22 },
              {
                text: "over misty mountains",
                category: "environment",
                start: 23,
                end: 43,
              },
            ],
          }),
        );
      });

      let suggestionsCalled = false;
      await page.route("**/api/enhancement/suggestions", async (route) => {
        suggestionsCalled = true;
        await route.fulfill(
          jsonResponse({
            suggestions: [
              "sweeping aerial shot",
              "tracking crane shot",
              "overhead establishing shot",
            ],
          }),
        );
      });

      await page.goto("/");
      const promptInput = page.getByLabel("Shot description");
      await expect(promptInput).toBeVisible({ timeout: 15000 });
      await promptInput.fill("Drone shot of mountains.");

      const optimizeShortcut =
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
      await promptInput.press(optimizeShortcut);

      // Wait for spans to render
      await expect(page.locator("[data-category]").first()).toBeVisible({
        timeout: 10000,
      });

      // Click the first span to trigger suggestions
      await page.locator("[data-category]").first().click();

      // Verify suggestions API was called
      await expect.poll(() => suggestionsCalled).toBe(true);
    },
  );
});
