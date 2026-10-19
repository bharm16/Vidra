import { test, expect } from "@playwright/test";
import { authenticated, drafts, guard, keepWords, project, versions } from "./helpers";

test.beforeEach(async ({ page }) => { await authenticated(page); });

test("direct clip output plays from an owned same-origin grant and downloads the original bytes", async ({ page }) => {
  await project(page, "clip");
  const words = "A controlled runner clip for playback proof";
  await keepWords(page, words);
  await page.getByRole("button", { name: "Make video", exact: true }).click();
  await expect.poll(async () => (await versions(page)).find(version => version.kind === "video")?.id, { timeout: 20000 }).toBeTruthy();
  await page.getByRole("button", { name: `View ${words}`, exact: true }).click();
  const viewer = page.getByRole("region", { name: "Media viewer", exact: true });
  const video = viewer.locator("video.vf-media-display");
  await expect.poll(async () => video.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && element.duration > 0)).toBe(true);
  const currentWords = await page.getByLabel("Current request words", { exact: true }).inputValue();
  await viewer.getByRole("button", { name: "Play clip", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Replay clip", exact: true })).toBeVisible();
  expect(await page.getByLabel("Current request words", { exact: true }).inputValue()).toBe(currentWords);
  const download = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Download original", exact: true }).click();
  expect((await download).suggestedFilename().length).toBeGreaterThan(0);
  await guard(page);
});

test("lost acceptance response recovers one immutable result after reload without another provider invocation", async ({ page }) => {
  await project(page);
  const before = (await (await page.request.get("/__test/state")).json()).providerCalls.filter((call: { kind: string }) => call.kind === "image").length;
  const words = "One deliberately lost browser acceptance response";
  await keepWords(page, words);
  await page.route("**/api/creation-requests", async route => { await route.fetch(); await route.abort("connectionreset"); }, { times: 1 });
  await page.getByRole("button", { name: "Make image", exact: true }).click();
  await expect.poll(async () => (await versions(page)).filter(version => version.label === words).length, { timeout: 20000 }).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: `View ${words}`, exact: true })).toBeVisible();
  expect((await versions(page)).filter(version => version.label === words)).toHaveLength(1);
  const after = (await (await page.request.get("/__test/state")).json()).providerCalls.filter((call: { kind: string }) => call.kind === "image").length;
  expect(after - before).toBe(1);
  await guard(page);
});

test("a delayed Use frame result enters Media without binding into words changed while it was pending", async ({ page }) => {
  await project(page, "clip");
  const words = "A controlled clip used as an exact frame source";
  await keepWords(page, words);
  await page.getByRole("button", { name: "Make video", exact: true }).click();
  await expect.poll(async () => (await versions(page)).find(version => version.kind === "video")?.id, { timeout: 20000 }).toBeTruthy();
  await page.getByRole("button", { name: `View ${words}`, exact: true }).click();
  const viewer = page.getByRole("region", { name: "Media viewer", exact: true });
  await expect.poll(async () => viewer.locator("video.vf-media-display").evaluate((element: HTMLVideoElement) => element.readyState >= 2 && element.duration > 0)).toBe(true);
  let resume: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  await page.route("**/media/*/frame", async route => { await gate; await route.continue(); });
  const entered = page.waitForRequest(request => request.url().endsWith("/frame") && request.method() === "POST");
  await viewer.getByRole("button", { name: "Use", exact: true }).click();
  await page.getByRole("button", { name: "Use a frame", exact: true }).click();
  await entered;
  const changed = "Changed after choosing the frame; keep this draft independent";
  try { await keepWords(page, changed); } finally { resume?.(); }
  await expect.poll(async () => (await versions(page)).filter(version => version.origin.kind === "frame").length, { timeout: 20000 }).toBe(1);
  await expect(page.getByLabel("Current request words", { exact: true })).toHaveValue(changed);
  const frame = (await versions(page)).find(version => version.origin.kind === "frame")!;
  const draftRows = await drafts(page);
  const current = draftRows.find(draft => draft.instructions === changed);
  expect(current).toBeTruthy();
  expect(current?.inputs.some(input => input.state === "resolved" && input.versionId === frame.id)).toBe(false);
  await guard(page);
});
