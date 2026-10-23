import { expect, test, type Page } from "@playwright/test";
import { injectAuthUser } from "./helpers/auth";
import { CONVERSATION_ID, PROJECT_ID, mockWorkspace } from "./helpers/workspace";

/**
 * The unified creative space's acceptance check (research Rule 1, Figma 2574:10511):
 * switching outputs and opening rail tools changes only the composer's inputs, words,
 * chips and primary; the URL, history rail, feed and the composer's docked place stay.
 */
const common = { schemaVersion: "vidra-workflow/v2", revision: "e2e/1", provider: "controlled", availability: "qualified", maxContextCharacters: 32000, constraints: [], recovery: { start: "supported", status: "unsupported", cancel: "unsupported", result: "unsupported", deadlineSeconds: 600 }, pricing: { mode: "free", maximumCreditsPerSlot: 0 } };
const shape = { label: "Shape", role: "shape" };
const profiles = [
  { ...common, id: "e2e-video", label: "Clip model", action: "make-video", endpoint: "controlled/video", mode: "text-to-video", inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 3 }], output: { kind: "video", maxCount: 1 }, generatedAudio: "always", parameters: { aspectRatio: { policy: "editable", domain: { kind: "enum", values: ["16:9", "9:16"] }, defaultValue: "16:9" }, durationSeconds: { policy: "editable", domain: { kind: "enum", values: [4, 8] }, defaultValue: 4 } }, presentation: { words: "required", parameters: { aspectRatio: shape, durationSeconds: { label: "Duration", role: "duration", format: "seconds" } } } },
  { ...common, id: "e2e-picture", label: "Picture model", action: "make-image", endpoint: "controlled/picture", mode: "text-to-image", inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 4 }], output: { kind: "image", maxCount: 4 }, generatedAudio: "unsupported", parameters: { aspectRatio: { policy: "editable", domain: { kind: "enum", values: ["1:1", "16:9"] }, defaultValue: "1:1" } }, presentation: { words: "required", parameters: { aspectRatio: shape } } },
  { ...common, id: "e2e-voice", label: "Voice model", action: "make-voiceover", endpoint: "controlled/voice", mode: "text-to-speech", inputs: [], output: { kind: "audio", maxCount: 2 }, generatedAudio: "always", parameters: { voice: { policy: "editable", domain: { kind: "enum", values: ["Rachel", "Drew"] }, defaultValue: "Rachel" } }, presentation: { words: "script", parameters: { voice: { label: "Voice", role: "voice" } } } },
  { ...common, id: "e2e-edit", label: "Picture editor", action: "edit-image", endpoint: "controlled/edit", mode: "image-edit", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }, { role: "mask", kinds: ["image"], minCount: 0, maxCount: 1 }], output: { kind: "image", maxCount: 1 }, generatedAudio: "unsupported", parameters: {}, presentation: { words: "required", parameters: {} } },
  { ...common, id: "e2e-clip-upscale", label: "Clip upscaler", action: "upscale-video", endpoint: "controlled/clip-upscale", mode: "video-upscale", inputs: [{ role: "clip", kinds: ["video"], minCount: 1, maxCount: 1 }], output: { kind: "video", maxCount: 1 }, generatedAudio: "unsupported", parameters: {}, presentation: { words: "none", parameters: {} } },
  { ...common, id: "e2e-upscale", label: "Upscaler", action: "upscale-image", endpoint: "controlled/upscale", mode: "image-upscale", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }], output: { kind: "image", maxCount: 1 }, generatedAudio: "unsupported", parameters: { upscaleFactor: { policy: "editable", domain: { kind: "enum", values: ["2x", "4x"] }, defaultValue: "2x" } }, presentation: { words: "none", parameters: { upscaleFactor: { label: "Scale", role: "scale" } } } },
];

async function open(page: Page): Promise<void> {
  await injectAuthUser(page);
  await page.route("**/e2e-media/**", route => route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='9'><rect width='16' height='9' fill='#d3a44e'/></svg>" }));
  await mockWorkspace(page, {
    profiles,
    requests: [
      { id: "request_first", action: "make-image", instructions: "A quiet desk under one warm lamp, late evening.", profileId: "e2e-picture", parameters: { aspectRatio: "16:9" }, results: [{ versionId: "version_first" }, { versionId: "version_second" }] },
      { id: "request_second", action: "make-image", instructions: "The same desk at dawn.", profileId: "e2e-picture", parameters: { aspectRatio: "16:9" }, results: [{ versionId: "version_third" }] },
    ],
    media: ["version_first", "version_second", "version_third"].map((id, index) => ({ id, kind: "image" as const, label: `Desk · v${index + 1}`, requestId: index < 2 ? "request_first" : "request_second", slotId: index < 2 ? `slot_0_${index}` : "slot_1_0", url: `http://127.0.0.1:58175/e2e-media/${id}.svg`, width: 1600, height: 900 })),
  });
  await page.goto(`/app/project/${PROJECT_ID}?conversation=${CONVERSATION_ID}`);
  await expect(page.getByRole("article", { name: "The same desk at dawn." })).toBeVisible();
}

test.use({ viewport: { width: 1440, height: 900 } });

test("switching outputs and rail tools keeps the route, the history rail, the feed and the composer's place", async ({ page }) => {
  await open(page);
  const url = page.url();
  const rail = page.getByRole("navigation", { name: "Request history" });
  await expect(rail.getByRole("button")).toHaveCount(2);
  // Docked at y876 on a 900-high window: its bottom never moves, it grows upward.
  const composerBottom = async (): Promise<number> => { const box = await page.locator(".vf-feed-composer").boundingBox(); return (box?.y ?? 0) + (box?.height ?? 0); };
  const before = await composerBottom();
  await expect(page.getByRole("radio")).toHaveText(["Video", "Image", "Voiceover", "Music"]);
  for (const output of ["Image", "Voiceover", "Music", "Video"]) {
    await page.getByRole("radio", { name: output }).click();
    await expect(page.getByRole("radio", { name: output })).toHaveAttribute("aria-checked", "true");
    expect(page.url()).toBe(url);
    await expect(rail.getByRole("button")).toHaveCount(2);
    await expect(page.locator(".vf-generation")).toHaveCount(2);
  }
  await page.getByRole("radio", { name: "Voiceover" }).click();
  await expect(page.getByRole("button", { name: "Make voiceover" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Voice: Rachel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Improve wording" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "Upscale" }).click();
  await expect(page.getByRole("radiogroup", { name: "Output" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upscale image" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Current request words" })).toHaveCount(0);
  // An empty Upscale takes either subject; the input then decides which action runs.
  const shelf = page.locator(".vf-feed-composer .vf-composer-media");
  await expect(shelf.getByRole("button", { name: "Picture" })).toBeVisible();
  await expect(shelf.getByRole("button", { name: "Clip" })).toBeVisible();
  expect(page.url()).toBe(url);
  expect(before).toBe(876);
  expect(await composerBottom()).toBe(876);
});

test("a result's verbs are buttons under it, and Focus opens and closes over the same feed", async ({ page }) => {
  await open(page);
  const block = page.getByRole("article", { name: "The same desk at dawn." });
  await expect(block.getByRole("group", { name: "Result actions" }).getByRole("button", { name: "Use as reference" })).toBeVisible();
  await block.getByRole("button", { name: "Open Desk · v3" }).click();
  await expect(page.getByRole("dialog", { name: "Focus" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Focus" })).toHaveCount(0);
  await expect(block).toBeVisible();
});

test("a result's verb binds it into the request being written, keeping the words", async ({ page }) => {
  await open(page);
  const words = page.getByRole("textbox", { name: "Current request words" });
  await words.fill("A brass lamp turns on.");
  await page.getByRole("article", { name: "The same desk at dawn." }).getByRole("group", { name: "Result actions" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit image" })).toBeVisible();
  await expect(page.locator(".vf-feed-composer .vf-input-tile")).toHaveCount(1);
  await expect(words).toHaveValue("A brass lamp turns on.");
});

test("Edit a region opens the picture at Focus size with a canvas to paint on", async ({ page }) => {
  await open(page);
  await page.getByRole("article", { name: "The same desk at dawn." }).getByRole("button", { name: "Edit a region" }).click();
  const canvas = page.getByRole("dialog", { name: "Focus" }).locator("canvas.ps-drawing-canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(600);
  expect(box?.height ?? 0).toBeGreaterThan(300);
});
