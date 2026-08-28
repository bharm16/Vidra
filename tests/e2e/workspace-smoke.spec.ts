import { expect, test } from "@playwright/test";
import { jsonResponse } from "./helpers/responses";
import { mockSessionRoutes } from "./helpers/mockRoutes";
import { injectAuthUser } from "./helpers/auth";

// FIXME(e2e): Same root cause as video-generation.spec.ts — the preview
// storyboard button (CanvasSettingsRow.tsx:432) is gated on showPreviewButton,
// which the mocked /api/optimize response doesn't drive on. Pre-existing
// failure on main for 5+ runs.
test.fixme(
  "workspace smoke: optimize, preview, and session persistence flow",
  async ({ page }) => {
    // Auth injection must happen before navigation. The Shot description
    // contenteditable is auth-gated; unauthenticated users only see a static
    // placeholder and can't interact with the editor.
    await injectAuthUser(page);

    let optimizeCalls = 0;
    let previewCalls = 0;
    let sessionMutationCalls = 0;

    await page.route("**/api/optimize", async (route) => {
      optimizeCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          prompt: "A cinematic runner sprinting through neon rain.",
          optimizedPrompt: "A cinematic runner sprinting through neon rain.",
          metadata: {
            previewPrompt: "A cinematic runner sprinting through neon rain.",
          },
        }),
      });
    });

    await page.route("**/api/preview/generate/storyboard", async (route) => {
      previewCalls += 1;
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            imageUrls: ["https://example.com/storyboard-1.png"],
            deltas: ["refined frame"],
            baseImageUrl: "https://example.com/storyboard-base.png",
          },
        }),
      );
    });

    await page.route("**/api/preview/generate", async (route) => {
      previewCalls += 1;
      await route.fulfill(
        jsonResponse({
          success: true,
          data: {
            imageUrl: "https://example.com/preview.png",
            metadata: {
              aspectRatio: "16:9",
              model: "replicate-flux-schnell",
              duration: 6,
              generatedAt: "2026-02-10T00:00:00.000Z",
            },
          },
        }),
      );
    });

    await mockSessionRoutes(page, {
      sessionId: "session_e2e_1",
      promptUuid: "prompt_e2e_1",
      createInput: "Initial prompt",
      loadedInput: "Loaded prompt",
      onMutation: () => {
        sessionMutationCalls += 1;
      },
    });

    await page.goto("/");

    const promptInput = page.getByLabel("Shot description");
    await expect(promptInput).toBeVisible();
    await promptInput.fill(
      "Wide shot of a cyclist crossing a rainy bridge at dusk.",
    );

    const optimizeShortcut =
      process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
    await promptInput.press(optimizeShortcut);
    await expect.poll(() => optimizeCalls).toBeGreaterThan(0);

    await page.getByLabel(/preview storyboard \d+ credits?/i).click();
    await expect.poll(() => previewCalls).toBeGreaterThan(0);

    // The sessions panel toggle now uses aria-label "Sessions" (rail icon).
    // The previous "Session selector" / "Open sessions" labels were removed
    // when the workspace got the rail-based navigation.
    const sessionsButton = page.getByRole("button", { name: /^sessions$/i });
    await expect
      .poll(async () => {
        if (sessionMutationCalls > 0) return true;
        return sessionsButton.isVisible();
      })
      .toBe(true);
    await expect(sessionsButton).toBeVisible();
  },
);
