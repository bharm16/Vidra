import { test, expect } from "@playwright/test";
import { SaveVideoEditSchema, VideoEditSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { authenticated, authHeaders, data, guard, makePicture, project } from "./helpers";

function gate(): { promise: Promise<void>; release(): void; isReleased(): boolean } {
  let released = false;
  let release = (): void => undefined;
  const promise = new Promise<void>(resolve => { release = (): void => { released = true; resolve(); }; });
  return { promise, release, isReleased: () => released };
}

test("an earlier edit's accepted save cannot replace or unlock the edit opened through browser Back", async ({ page }) => {
  await authenticated(page); const projectId = await project(page); const label = "An exact picture shared by independent edits";
  const versionId = await makePicture(page, label);
  const create = async (suffix: string, displayFrames: number) => data(await page.request.post(`/api/projects/${projectId}/video-edits`, { headers: authHeaders, data: { id: `edit_${suffix}_${crypto.randomUUID()}`, name: suffix, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: `item_${suffix}`, versionId, kind: "picture", inFrame: 0, outFrame: 0, displayFrames, fit: "fit", sourceAudio: { muted: true, gain: 1 } }], text: [] } } }), VideoEditSchema);
  const a = await create("a", 90); const b = await create("b", 120);
  const editUrl = (id: string): string => `/app/project/${projectId}?view=video&edit=${encodeURIComponent(id)}`;
  const get = async (id: string) => data(await page.request.get(`/api/projects/${projectId}/video-edits/${id}`, { headers: authHeaders }), VideoEditSchema);
  await page.goto(editUrl(b.id));
  const item = page.getByRole("button", { name: new RegExp(`Edit ${label},`) }); await expect(item).toBeVisible();
  const documentId = crypto.randomUUID(); await page.evaluate(id => { document.documentElement.dataset.scopeProof = id; }, documentId);
  // The app's ordinary history listener handles this same-document URL entry.
  await page.evaluate(url => { const state = { ...history.state, idx: (history.state?.idx ?? 0) + 1 }; history.pushState(state, "", url); dispatchEvent(new PopStateEvent("popstate", { state })); }, editUrl(a.id));
  await expect(page.locator(".ve-time")).toHaveText(/0:03/); await item.click();
  const acceptedA = gate(); const replyA = gate(); const acceptedB = gate(); const replyB = gate();
  const aCommands: Array<ReturnType<typeof SaveVideoEditSchema.parse>> = [];
  const pathA = `**/video-edits/${a.id}/commands`; const pathB = `**/video-edits/${b.id}/commands`;
  await page.route(pathA, async route => { aCommands.push(SaveVideoEditSchema.parse(route.request().postDataJSON())); const response = await route.fetch(); acceptedA.release(); await replyA.promise; await route.fulfill({ response }); });
  await page.route(pathB, async route => { const response = await route.fetch(); acceptedB.release(); await replyB.promise; await route.fulfill({ response }); });
  try {
    await page.getByLabel("Duration seconds", { exact: true }).fill("5"); await page.getByLabel("Duration seconds", { exact: true }).press("Enter"); await expect.poll(acceptedA.isReleased).toBe(true);
    expect((await get(a.id)).composition.items[0]?.displayFrames).toBe(150);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("edit")).toBe(b.id);
    await expect(page.locator("html")).toHaveAttribute("data-scope-proof", documentId);
    await expect(page.locator(".ve-time")).toHaveText(/0:04/); await item.click();
    const duration = page.getByLabel("Duration seconds", { exact: true }); await expect(duration).toBeEnabled();
    await duration.fill("6"); await duration.press("Enter"); await expect.poll(acceptedB.isReleased).toBe(true);
    const observedA = page.waitForResponse(response => response.url().endsWith(`/video-edits/${a.id}/commands`)); replyA.release(); await observedA;
    await expect(duration).toBeDisabled(); expect(new URL(page.url()).searchParams.get("edit")).toBe(b.id);
    const observedB = page.waitForResponse(response => response.url().endsWith(`/video-edits/${b.id}/commands`)); replyB.release(); await observedB;
    await expect(page.locator(".ve-time")).toHaveText(/0:06/); await expect(duration).toBeEnabled();
    await expect(page.getByRole("button", { name: "Retry saving edit", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Undo video edit", exact: true }).click();
    await expect.poll(async () => (await get(b.id)).composition.items[0]?.displayFrames).toBe(120);
    await expect(page.locator(".ve-time")).toHaveText(/0:04/); expect((await get(a.id)).composition.items[0]?.displayFrames).toBe(150);
    expect(new URL(page.url()).searchParams.get("edit")).toBe(b.id);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: /^Edit 1\b/ }).click();
    await expect(page.getByRole("button", { name: "Restore edit 1", exact: true })).toBeVisible();
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get("edit")).toBe(a.id);
    await expect(page.locator(".ve-time")).toHaveText(/0:05/);
    await expect(page.getByRole("button", { name: "Restore edit 1", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Retry saving edit", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry saving edit", exact: true })).toHaveCount(0);
    expect(aCommands[1]).toEqual(aCommands[0]);
    expect((await get(a.id)).revision).toBe(2);
    await page.getByRole("button", { name: "Captions", exact: true }).click();
    await page.getByRole("button", { name: "Add caption", exact: true }).click();
    await page.getByLabel("Caption text", { exact: true }).fill("Uncommitted caption words belong to A");
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("edit")).toBe(b.id);
    await expect(page.getByLabel("Caption text", { exact: true })).toHaveCount(0);
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get("edit")).toBe(a.id);
    await page.getByRole("button", { name: "Captions", exact: true }).click();
    await page.getByRole("button", { name: "Add caption", exact: true }).click();
    await expect(page.getByLabel("Caption text", { exact: true })).toHaveValue("Uncommitted caption words belong to A");
    expect((await get(a.id)).composition.text).toEqual([]);
    expect((await get(b.id)).composition.text).toEqual([]);
    await page.getByRole("region", { name: "Add caption", exact: true }).getByRole("button", { name: "Add caption", exact: true }).click();
    await expect.poll(async () => (await get(a.id)).composition.text.length).toBe(1);
    const beforeRemote = await get(a.id); const cue = beforeRemote.composition.text[0]; if (!cue) throw new Error("Expected A's saved caption");
    await page.getByRole("button", { name: cue.text, exact: true }).click();
    await page.getByLabel("Caption text", { exact: true }).fill("Retained local caption before another tab saves");
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("edit")).toBe(b.id);
    const remote = await data(await page.request.post(`/api/projects/${projectId}/video-edits/${a.id}/commands`, { headers: authHeaders, data: { operationId: `operation_${crypto.randomUUID()}`, expectedRevision: beforeRemote.revision, command: { kind: "text", text: { ...cue, text: "Caption saved by another tab" } } } }), VideoEditSchema);
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get("edit")).toBe(a.id);
    await page.getByRole("button", { name: "Caption saved by another tab", exact: true }).click();
    const words = page.getByLabel("Caption text", { exact: true });
    await expect(words).toHaveValue("Retained local caption before another tab saves");
    await expect(page.getByText("This caption changed elsewhere. Your unfinished words are kept here. Edit them to save a new revision.", { exact: true })).toBeVisible();
    await words.press("Tab"); expect((await get(a.id)).revision).toBe(remote.revision);
    await words.fill("Retained local caption before another tab saves, continued"); await words.press("Tab");
    await expect.poll(async () => (await get(a.id)).composition.text[0]?.text).toBe("Retained local caption before another tab saves, continued");
    const revisions = await data(await page.request.get(`/api/projects/${projectId}/video-edits/${a.id}/revisions`, { headers: authHeaders }), VideoEditSchema.array());
    expect(revisions.find(revision => revision.revision === remote.revision)).toEqual(remote);
    expect(revisions.find(revision => revision.revision === beforeRemote.revision)).toEqual(beforeRemote);
    expect((await get(b.id)).composition.text).toEqual([]);
    await expect(page.locator("html")).toHaveAttribute("data-scope-proof", documentId); await guard(page);
  } finally {
    replyA.release(); replyB.release(); await page.unroute(pathA); await page.unroute(pathB);
  }
});
