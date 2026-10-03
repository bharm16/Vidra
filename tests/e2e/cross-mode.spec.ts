import { expect, test, type Page } from "@playwright/test";
import { injectAuthUser } from "./helpers/auth";
import type { SessionPrompt } from "@shared/types/session";

const WORDS = "a paper boat on a wet street at night";
const API_KEY = "replay-cross-mode-key";
const SELECTED_MODEL = "google/veo-3";
type BrowserState = {
  sessions: Array<{ id: string; prompt: SessionPrompt }>;
  providerCalls: Array<{
    prompt: string;
    model: string;
    options: Record<string, unknown>;
  }>;
  outbound: string[];
  depthInputs: Array<{ image_url: string }>;
};
type Acceptance = {
  sessionId: string;
  generationId: string;
  promptVersionId: string;
  attachment: { state: string };
  arming: { state: string };
};

async function acceptShownFrame(page: Page): Promise<Acceptance> {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sketch/accept") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Use this", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBeLessThan(300);
  return ((await response.json()) as { data: Acceptance }).data;
}

async function browserState(page: Page): Promise<BrowserState> {
  const response = await page.request.get("/__test/state");
  expect(response.ok()).toBe(true);
  return (await response.json()) as BrowserState;
}

async function drawLiveFrame(page: Page, words = WORDS): Promise<void> {
  await page.goto("/live-editor");
  await page.getByLabel("Prompt", { exact: true }).fill(words);
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.keyboard.press("Escape");
  const box = await page.getByLabel("Sketchpad", { exact: true }).boundingBox();
  if (!box) throw new Error("Sketchpad is not drawable");
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(
    page.getByRole("img", { name: "Generated frame", exact: true }),
  ).toBeVisible();
}

async function preparePage(page: Page): Promise<void> {
  await injectAuthUser(page, {
    uid: `api-key:${API_KEY}`,
    email: "browser-proof@example.com",
    displayName: "Browser proof",
  });
  await page.setExtraHTTPHeaders({ "x-api-key": API_KEY });
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
  // Only the object transport is routed. Application APIs reach the real server.
  await page.route("https://objects.cross-mode.invalid/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await page.request.get(
      `/__test/objects?path=${encodeURIComponent(decodeURIComponent(url.pathname.slice(1)))}`,
    );
    await route.fulfill({ response });
  });
  await page.request.get("/__test/fault?append=ok");
}

test.describe("cross-mode actual controls and HTTP intake", () => {
  test.skip(
    process.env.CROSS_MODE_BROWSER_PROOF !== "1",
    "Run with tests/e2e/cross-mode/playwright.config.ts for the isolated, zero-spend boundary adapters.",
  );
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test("sketch acceptance, studio edit, return, camera words and a durable clip", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    const acceptedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/sketch/accept") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Use this", exact: true }).click();
    const accepted = await acceptedResponse;
    expect(accepted.status()).toBeLessThan(300);
    await page.waitForURL(/\/session\//);
    const sessionUrl = page.url();
    const sessionId = new URL(sessionUrl).pathname.split("/").at(-1);
    const firstState = await browserState(page);
    const session = firstState.sessions.find((entry) => entry.id === sessionId);
    expect(session).toBeDefined();
    const firstTake = session?.prompt.versions?.flatMap(
      (version) => version.generations ?? [],
    )[0];
    if (!firstTake)
      throw new Error("Acceptance did not persist a picture take");
    await expect(page.getByLabel("Shot description")).toHaveText(WORDS);
    await page.getByTestId(`space-node-menu-${firstTake.id}`).click();
    await page.getByRole("menuitem", { name: "Refine in the studio" }).click();
    await page.waitForURL(/\/studio\//);
    await page
      .getByLabel("Message", { exact: true })
      .fill("take the reflection out");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const result = page.locator('[data-testid^="studio-result-"]').first();
    await expect(result.locator("img")).toBeVisible();
    await result.locator("button").first().click();
    await expect(result.locator("button").first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page
      .getByRole("button", { name: "Use this in the session", exact: true })
      .click();
    await page.getByRole("link", { name: "Open it", exact: true }).click();
    await expect(page).toHaveURL(sessionUrl);
    const afterReturn = await browserState(page);
    const returned = afterReturn.sessions
      .find((entry) => entry.id === sessionId)
      ?.prompt.versions?.flatMap((version) => version.generations ?? [])
      .find((take) => take.origin === "studio");
    expect(returned?.ancestorGenerationId).toBe(firstTake.id);
    await page
      .getByRole("button", { name: "Video model", exact: true })
      .click();
    await page.getByRole("option", { name: /Veo/ }).click();
    await expect(
      page.getByRole("button", { name: "Video model", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: /^Camera motion/ }).click();
    await expect(page.getByTestId("camera-motion-illustrative")).toBeVisible();
    await page.getByRole("option", { name: "Push In", exact: true }).click();
    const visibleWords = await page
      .getByLabel("Shot description")
      .textContent();
    expect(visibleWords).toContain("The camera pushes in.");
    const [response] = await Promise.all([
      page.waitForResponse(
        (reply) =>
          reply.url().includes("/api/preview/video") &&
          reply.request().method() === "POST",
      ),
      page.getByTestId("canvas-generate-button").click(),
    ]);
    expect(response.status()).toBe(202);
    const submitted = response.request().postDataJSON() as Record<
      string,
      unknown
    >;
    expect(submitted.prompt).toBe(visibleWords);
    expect(submitted.sourceGenerationId).toBe(returned?.id);
    expect(submitted.sessionId).toBe(sessionId);
    expect(submitted.model).toBe(SELECTED_MODEL);
    expect(typeof submitted.startImage).toBe("string");
    await expect(page.getByTestId("canvas-generate-button")).toBeDisabled();
    const published = (await response.json()) as { data: { jobId: string } };
    const jobId = published.data.jobId;
    await expect
      .poll(async () => (await browserState(page)).providerCalls.length)
      .toBeGreaterThan(0);
    const lastCall = (await browserState(page)).providerCalls.at(-1);
    expect(lastCall?.prompt).toBe(visibleWords);
    expect(lastCall?.model).toBe(SELECTED_MODEL);
    expect(lastCall?.options.startImage).toBe(submitted.startImage);
    await expect
      .poll(
        async () =>
          (await browserState(page)).sessions
            .find((entry) => entry.id === sessionId)
            ?.prompt.versions?.flatMap((version) => version.generations ?? [])
            .find((take) => take.id === jobId)?.status,
      )
      .toBe("completed");
    await expect(page.getByTestId(`space-node-${jobId}`)).toBeVisible();
    await page
      .getByRole("button", { name: "Fit to view", exact: true })
      .click();
    await page.getByTestId(`space-node-menu-${jobId}`).click();
    await page.getByRole("menuitem", { name: "Play", exact: true }).click();
    await expect(page.locator("video").first()).toBeVisible();
    await expect
      .poll(async () =>
        page
          .locator("video")
          .first()
          .evaluate((video: HTMLVideoElement) => video.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await page
      .getByRole("button", { name: "Play video preview", exact: true })
      .click();
    await expect
      .poll(async () =>
        page
          .locator("video")
          .first()
          .evaluate((video: HTMLVideoElement) => video.paused),
      )
      .toBe(false);
    await page.getByLabel("Close generation detail").click();
    await page.reload();
    await expect(
      page.getByTestId(`space-node-words-${String(submitted.promptVersionId)}`),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Fit to view", exact: true })
      .click();
    await page
      .getByTestId(`space-node-words-${String(submitted.promptVersionId)}`)
      .press("Enter");
    await expect(page.getByLabel("Shot description")).toHaveText(
      visibleWords ?? "",
    );
    await page
      .getByRole("button", { name: "Fit to view", exact: true })
      .click();
    await page.getByTestId(`space-node-menu-${jobId}`).click();
    await page.getByRole("menuitem", { name: "Play", exact: true }).click();
    await expect(page.locator("video").first()).toBeVisible();
    expect((await browserState(page)).outbound).toEqual([]);
  });

  test("failed attachment remains visible after navigation and reload and retries the same take", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    await page.request.get("/__test/fault?append=fail");
    const accepted = await acceptShownFrame(page);
    expect(accepted.attachment.state).toBe("failed");
    await expect(
      page.getByTestId("live-editor-accept-unattached"),
    ).toContainText("Picture made, but not saved yet");
    expect(new URL(page.url()).pathname).toBe("/live-editor");
    await page.goto(`/session/${accepted.sessionId}`);
    await page.reload();
    await expect(
      page.getByText("Made, but not saved", { exact: true }),
    ).toBeVisible();
    await page.request.get("/__test/fault?append=ok");
    await page.getByRole("button", { name: "Save it", exact: true }).click();
    await expect(
      page.getByTestId(`space-node-${accepted.generationId}`),
    ).toBeVisible();
    const session = (await browserState(page)).sessions.find(
      (entry) => entry.id === accepted.sessionId,
    );
    expect(
      session?.prompt.versions
        ?.flatMap((version) => version.generations ?? [])
        .filter((take) => take.id === accepted.generationId),
    ).toHaveLength(1);
  });

  test("failed arming keeps the saved take and Set it arms that same identity", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    await page.request.get("/__test/fault?arm=fail");
    const accepted = await acceptShownFrame(page);
    expect(accepted.attachment.state).toBe("attached");
    expect(accepted.arming.state).toBe("failed");
    await expect(page.getByTestId("live-editor-accept-unarmed")).toContainText(
      "Picture saved, but not set as the first frame",
    );
    expect(new URL(page.url()).pathname).toBe("/live-editor");
    await page.request.get("/__test/fault?arm=ok");
    await page.getByRole("button", { name: "Set it", exact: true }).click();
    await page.waitForURL(`**/session/${accepted.sessionId}`);
    await page.reload();
    await expect(
      page.getByTestId(`space-node-${accepted.generationId}`),
    ).toBeVisible();
    const session = (await browserState(page)).sessions.find(
      (entry) => entry.id === accepted.sessionId,
    );
    expect(session?.prompt.keyframes?.[0]?.generationId).toBe(
      accepted.generationId,
    );
  });

  test("concurrent transport retries of one acceptance create one session and one take", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    const before = (await browserState(page)).sessions.length;
    let concurrentStatuses: number[] = [];
    await page.route("**/api/sketch/accept", async (route) => {
      const [first, second] = await Promise.all([route.fetch(), route.fetch()]);
      concurrentStatuses = [first.status(), second.status()];
      const success = first.ok() ? first : second;
      await route.fulfill({ response: success });
    });
    const accepted = await acceptShownFrame(page);
    await page.waitForURL(`**/session/${accepted.sessionId}`);
    expect(concurrentStatuses.some((status) => status < 300)).toBe(true);
    expect(
      concurrentStatuses.every((status) => status < 300 || status === 409),
    ).toBe(true);
    const after = await browserState(page);
    expect(after.sessions).toHaveLength(before + 1);
    const takes = after.sessions
      .find((entry) => entry.id === accepted.sessionId)
      ?.prompt.versions?.flatMap((version) => version.generations ?? []);
    expect(takes).toHaveLength(1);
    expect(takes?.[0]?.id).toBe(accepted.generationId);
  });

  test("a lost response after commit retries the same acceptance", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    const before = (await browserState(page)).sessions.length;
    let loseResponse = true;
    let committed: Acceptance | undefined;
    const keys: string[] = [];
    await page.route("**/api/sketch/accept", async (route) => {
      const payload = route.request().postDataJSON() as {
        idempotencyKey: string;
      };
      keys.push(payload.idempotencyKey);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (loseResponse) {
        committed = ((await response.json()) as { data: Acceptance }).data;
        loseResponse = false;
        await route.abort("connectionclosed");
      } else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Use this", exact: true }).click();
    await expect(page.getByTestId("live-editor-accept-error")).toBeVisible();
    const replayed = await acceptShownFrame(page);
    expect(replayed.generationId).toBe(committed?.generationId);
    expect(replayed.sessionId).toBe(committed?.sessionId);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect((await browserState(page)).sessions).toHaveLength(before + 1);
  });

  test("navigation during acceptance never redirects a creator who has left", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed: Acceptance | undefined;
    await page.route("**/api/sketch/accept", async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committed = ((await response.json()) as { data: Acceptance }).data;
      await barrier;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Use this", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Accepting…" }),
    ).toBeDisabled();
    await expect.poll(() => committed?.generationId).toBeTruthy();
    await page
      .getByRole("link", { name: "Library", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/history$/);
    release?.();
    await expect(
      page.getByRole("link", { name: /Open session:/ }).first(),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/history");
    await page.goto(`/session/${committed?.sessionId}`);
    await expect(
      page.getByTestId(`space-node-${committed?.generationId}`),
    ).toBeVisible();
  });

  test("selecting an older picture restores its associated version words", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    const accepted = await acceptShownFrame(page);
    await page.waitForURL(`**/session/${accepted.sessionId}`);
    await page
      .getByRole("button", { name: "Camera motion", exact: true })
      .click();
    await expect(page.getByTestId("camera-motion-illustrative")).toBeVisible();
    await page.getByRole("option", { name: "Push In", exact: true }).click();
    await expect(page.getByLabel("Shot description")).toContainText(
      "The camera pushes in.",
    );
    await expect
      .poll(
        async () =>
          (await browserState(page)).sessions.find(
            (entry) => entry.id === accepted.sessionId,
          )?.prompt.versions?.length ?? 0,
      )
      .toBeGreaterThan(1);
    await page.getByTestId(`space-node-${accepted.generationId}`).click();
    await expect(page.getByLabel("Shot description")).toHaveText(WORDS);
    const take = (await browserState(page)).sessions
      .find((entry) => entry.id === accepted.sessionId)
      ?.prompt.versions?.flatMap((version) => version.generations ?? [])
      .find((record) => record.id === accepted.generationId);
    expect(take?.promptVersionId).toBe(accepted.promptVersionId);
  });

  test("expired media is recovered from its durable handle on reload", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    const accepted = await acceptShownFrame(page);
    await page.waitForURL(`**/session/${accepted.sessionId}`);
    let staleReads = 0;
    await page.route("https://expired.media.invalid/**", async (route) => {
      staleReads += 1;
      await route.abort("blockedbyclient");
    });
    await page.request.get(`/__test/expire?sessionId=${accepted.sessionId}`);
    await page.reload();
    const node = page.getByTestId(`space-node-${accepted.generationId}`);
    await expect(node).toBeVisible();
    await expect
      .poll(async () =>
        node
          .locator("img")
          .first()
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    expect(staleReads).toBe(0);
    const current = await page.request.get(
      `/api/sessions/${accepted.sessionId}`,
      { headers: { "x-api-key": API_KEY } },
    );
    expect(current.ok()).toBe(true);
    const response = (await current.json()) as {
      data: { prompt: SessionPrompt };
    };
    const restored = response.data.prompt.versions
      ?.flatMap((version) => version.generations ?? [])
      .find((take) => take.id === accepted.generationId);
    expect(restored?.id).toBe(accepted.generationId);
    expect(JSON.stringify(restored?.mediaUrls)).not.toContain(
      "expired.media.invalid",
    );
  });

  test("two distinct shown outputs are accepted concurrently without losing either", async ({
    page,
    context,
  }) => {
    const second = await context.newPage();
    await preparePage(second);
    const secondWords = "a glass bottle on a beach at sunrise";
    await Promise.all([
      drawLiveFrame(page),
      drawLiveFrame(second, secondWords),
    ]);
    expect(
      await page
        .getByRole("img", { name: "Generated frame" })
        .getAttribute("src"),
    ).not.toBe(
      await second
        .getByRole("img", { name: "Generated frame" })
        .getAttribute("src"),
    );
    const before = (await browserState(page)).sessions.length;
    let oldAcceptance: Acceptance | undefined;
    let newAcceptance: Acceptance | undefined;
    let releaseOld: (() => void) | undefined;
    let releaseNew: (() => void) | undefined;
    const oldBarrier = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const newBarrier = new Promise<void>((resolve) => {
      releaseNew = resolve;
    });
    await page.route("**/api/sketch/accept", async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      oldAcceptance = ((await response.json()) as { data: Acceptance }).data;
      await oldBarrier;
      await route.fulfill({ response });
    });
    await second.route("**/api/sketch/accept", async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      newAcceptance = ((await response.json()) as { data: Acceptance }).data;
      await newBarrier;
      await route.fulfill({ response });
    });
    await page.request.get("/__test/fault?concurrent=2");
    try {
      await Promise.all([
        page.getByRole("button", { name: "Use this", exact: true }).click(),
        second.getByRole("button", { name: "Use this", exact: true }).click(),
      ]);
      await expect
        .poll(() => Boolean(oldAcceptance && newAcceptance))
        .toBe(true);
      expect(oldAcceptance?.generationId).not.toBe(newAcceptance?.generationId);
      expect(oldAcceptance?.sessionId).not.toBe(newAcceptance?.sessionId);
      releaseNew?.();
      await second.waitForURL(`**/session/${newAcceptance?.sessionId}`);
      await expect(second.getByLabel("Shot description")).toHaveText(
        secondWords,
      );
      releaseOld?.();
      await page.waitForURL(`**/session/${oldAcceptance?.sessionId}`);
      await expect(page.getByLabel("Shot description")).toHaveText(WORDS);
      expect(new URL(second.url()).pathname).toBe(
        `/session/${newAcceptance?.sessionId}`,
      );
      const after = await browserState(page);
      expect(after.sessions).toHaveLength(before + 2);
      for (const acceptance of [oldAcceptance, newAcceptance]) {
        const takes = after.sessions
          .find((session) => session.id === acceptance?.sessionId)
          ?.prompt.versions?.flatMap((version) => version.generations ?? []);
        expect(takes).toHaveLength(1);
        expect(takes?.[0]?.id).toBe(acceptance?.generationId);
      }
    } finally {
      releaseOld?.();
      releaseNew?.();
      await second.close();
    }
  });

  test("depth available keeps the real picker illustrative and writes the selected words", async ({
    page,
  }) => {
    await drawLiveFrame(page);
    const accepted = await acceptShownFrame(page);
    await page.waitForURL(`**/session/${accepted.sessionId}`);
    await page.request.get("/__test/fault?depth=available");
    const [response] = await Promise.all([
      page.waitForResponse(
        (reply) =>
          reply.url().endsWith("/api/motion/depth") &&
          reply.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Camera motion", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    const result = (await response.json()) as {
      data: { fallbackMode: boolean; depthMapUrl: string };
    };
    expect(result.data.fallbackMode).toBe(false);
    expect(result.data.depthMapUrl).toContain("depth-fixture.png");
    await expect(page.getByTestId("camera-motion-illustrative")).toBeVisible();
    await page.getByRole("option", { name: "Push In", exact: true }).click();
    await expect(page.getByLabel("Shot description")).toContainText(
      "The camera pushes in.",
    );
    const state = await browserState(page);
    expect(state.depthInputs.at(-1)?.image_url).toContain(
      "objects.cross-mode.invalid/",
    );
    expect(state.outbound).toEqual([]);
  });
});
