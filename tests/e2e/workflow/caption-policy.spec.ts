import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ApiErrorResponseSchema } from "@shared/schemas/api.schemas";
import { CreateVideoExportSchema, VideoCaptionValidationDetailsSchema, VideoEditSchema, VideoExportSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { runNative } from "@services/video-export/NativeProcess";
import { OWNER, authenticated, authHeaders, data, drafts, guard, keepWords, project, versions } from "./helpers";

const invalidCaption = "Make room for evening.🔥";
const supportedCaption = "Make room for evening.";

async function exportCheckpoints(page: Page, projectId: string): Promise<Array<{ key: string; value: unknown }>> {
  const prefix = `vidra.video-editor.v1:${encodeURIComponent(OWNER)}:${encodeURIComponent(projectId)}:`;
  return page.evaluate(scope => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).flatMap(key => {
    if (!key?.startsWith(scope) || !key.endsWith(":export")) return [];
    const raw = localStorage.getItem(key); if (raw === null) return [];
    const value: unknown = JSON.parse(raw); return [{ key, value }];
  }), prefix);
}

test("E20 native caption rejection preserves the words and permits a fresh corrected immutable export", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  await authenticated(page);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const evidence: Record<string, unknown> = {
    sourceNodeId: "912:326292", sourceScreenshot: ".scratch/visual-fidelity/figma-retained/912-326292.png",
    boundary: "Authenticated actual ProjectWorkspace and owned project API; isolated Firestore emulator; immutable checked local storage adapter; real NativeVideoRenderer/FFmpeg/Pango. Bundled source posters are admitted through real imports; runner clips are held posters with synthetic probe audio, not provider motion. No injected edit issues or mocked export responses.",
    visualScope: "Actual full editor with its persistent Media pane at1440×900. E20 is a pre-reflow source example: current canonical caption-card placement is retained. Real4s held-poster runner clips and the unchanged bundled desk PNG use source display filenames; the independent Music track is not seeded. Whole-frame content/pixel parity is not claimed.",
  };
  try {
    const id = await project(page);
    const words = "Keep these independent request words while correcting the video caption";
    await keepWords(page, words);
    const retainedDraft = (await drafts(page, id)).find(draft => draft.instructions === words);
    expect(retainedDraft).toBeDefined();

    const runnerPoster = "client/public/design-assets/workspace-media-runner.png";
    const deskPoster = "client/public/design-assets/fidelity-public-desk.png";
    const clips = [{ label: "Stadium · v1", file: "stadium-v1.mp4", frequency: 440 }, { label: "Stadium · v2", file: "stadium-v2.mp4", frequency: 660 }];
    const [firstClip, lastClip] = clips;
    if (!firstClip || !lastClip) throw new Error("Both source runner clips must be defined");
    const assetHashes = { runner: createHash("sha256").update(await readFile(runnerPoster)).digest("hex"), desk: createHash("sha256").update(await readFile(deskPoster)).digest("hex") };
    await Promise.all(clips.map(async clip => {
      await runNative("ffmpeg", ["-v", "error", "-nostdin", "-y", "-loop", "1", "-framerate", "30", "-i", runnerPoster, "-f", "lavfi", "-i", `sine=frequency=${clip.frequency}:sample_rate=48000:duration=4`, "-t", "4", "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", testInfo.outputPath(clip.file)], { timeoutMs: 30000 });
    }));
    await page.getByRole("button", { name: "Project media", exact: true }).click();
    const library = page.getByRole("main", { name: "Project Media library", exact: true });
    for (const source of [{ path: testInfo.outputPath(firstClip.file), label: firstClip.label, mimeType: "video/mp4" }, { path: deskPoster, label: "Desk · v2", mimeType: "image/png" }, { path: testInfo.outputPath(lastClip.file), label: lastClip.label, mimeType: "video/mp4" }]) {
      await library.getByLabel("Choose media file", { exact: true }).setInputFiles({ name: source.label, mimeType: source.mimeType, buffer: await readFile(source.path) });
      await expect(library.getByRole("button", { name: `Open ${source.label}`, exact: true })).toBeVisible();
    }
    const sources = await versions(page, id);
    expect(sources).toHaveLength(3);
    expect(sources.every(source => source.ownerId === OWNER && source.object.identity === "verified" && source.metadata.state === "verified")).toBe(true);
    const first = sources.find(source => source.label === firstClip.label);
    const picture = sources.find(source => source.label === "Desk · v2");
    const last = sources.find(source => source.label === lastClip.label);
    if (!first || !picture || !last) throw new Error("Three owned imported sources must exist");
    expect(picture.object.identity === "verified" && picture.object.sha256).toBe(assetHashes.desk);
    for (const source of [first, last]) expect(source.metadata).toMatchObject({ state: "verified", width: 1344, height: 768, durationSeconds: 4, audio: "present" });
    evidence.inputAssets = { runnerPoster, deskPoster, assetHashes, heldPostersOnly: true, providerMotionQualified: false, probeAudio: clips.map(clip => ({ filename: clip.label, frequencyHz: clip.frequency })), importedSources: sources };
    const initial = await data(await page.request.post(`/api/projects/${id}/video-edits`, {
      headers: authHeaders, data: {
        id: `edit_${crypto.randomUUID()}`, name: "E20 real caption policy",
        composition: {
          normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30,
          items: [first, picture, last].map((source, index) => ({ id: `item_${index + 1}`, versionId: source.id, kind: source.kind === "image" ? "picture" : "clip", inFrame: 0, outFrame: 120, displayFrames: 120, fit: "fit", sourceAudio: { muted: source.kind === "image", gain: 1 } })),
          text: [{ id: "caption_e20", text: invalidCaption, anchor: { kind: "item", itemId: "item_1" }, startFrame: 30, endFrame: 105, x: .056816, y: .868692, width: .886364, height: .12, fontSize: 43.636, fontWeight: 500, fontFamily: "Inter", letterSpacingEm: 0, lineHeightEm: 1.3, color: "#F7F7F7", align: "center" }],
        },
      },
    }), VideoEditSchema);
    expect(initial.ownerId).toBe(OWNER);
    expect(initial.issues).toEqual([]);
    const getEdit = async () => data(await page.request.get(`/api/projects/${id}/video-edits/${initial.id}`, { headers: authHeaders }), VideoEditSchema);
    const getExports = async () => data(await page.request.get(`/api/projects/${id}/exports`, { headers: authHeaders }), z.array(VideoExportSchema));
    const getRevisions = async () => data(await page.request.get(`/api/projects/${id}/video-edits/${initial.id}/revisions`, { headers: authHeaders }), z.array(VideoEditSchema));
    await page.goto(`/app/project/${id}?view=video&edit=${initial.id}`);
    const editor = page.getByRole("main", { name: "Video editor", exact: true });
    await expect(editor).toHaveAttribute("data-presentation", "full");
    await page.getByRole("slider", { name: "Timeline playhead", exact: true }).fill("90");
    await expect.poll(() => editor.locator(".ve-source-crop video").evaluate(video => video instanceof HTMLVideoElement && video.readyState >= 2)).toBe(true);
    await expect(editor.getByText("Opening…", { exact: true })).toHaveCount(0, { timeout: 30000 });
    await expect(editor.locator(".ve-desktop-media .ve-media-option video")).toHaveCount(2);
    await expect.poll(() => editor.locator(".ve-desktop-media video,.ve-filmstrip video").evaluateAll(videos => videos.every(video => video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth > 0)), { timeout: 30000 }).toBe(true);
    const exportButton = editor.getByRole("button", { name: "Export", exact: true });
    await expect(exportButton).toBeEnabled();
    expect(await getExports()).toEqual([]);

    const rejectionPromise = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/projects/${id}/video-edits/${initial.id}/exports`);
    await exportButton.click();
    const rejection = await rejectionPromise;
    expect(rejection.status()).toBe(422);
    const rejectedEnvelope = CreateVideoExportSchema.parse(rejection.request().postDataJSON());
    const rejectedResponse = ApiErrorResponseSchema.parse(await rejection.json());
    expect(rejectedResponse.code).toBe("invalid_settings");
    const details = VideoCaptionValidationDetailsSchema.parse(JSON.parse(rejectedResponse.details ?? "null"));
    expect(details).toMatchObject({ ownerId: OWNER, projectId: id, editId: initial.id, revision: initial.revision });
    expect(details.issues).toContainEqual(expect.objectContaining({ elementId: "caption_e20", code: "text_render_policy", unsupportedCodePoints: expect.arrayContaining([0x1F525]) }));
    await expect(editor.getByText("Caption 1 cannot be exported", { exact: true })).toBeVisible();
    await expect(editor.getByText("Choose a font or edit the unsupported character.", { exact: true })).toBeVisible();
    await expect(exportButton).toBeDisabled();
    await expect(editor.locator(".ve-caption-preview")).toHaveText(supportedCaption);
    expect(await getExports()).toEqual([]);
    await expect.poll(() => exportCheckpoints(page, id)).toEqual([]);
    expect(await getEdit()).toEqual(initial);
    await editor.getByRole("button", { name: "Edit caption", exact: true }).click();
    const captionField = page.getByLabel("Caption text", { exact: true });
    await expect(captionField).toHaveValue(invalidCaption);
    await page.mouse.move(0, 0); await page.evaluate(() => document.fonts.ready);
    const failureScreenshot = testInfo.outputPath("E20-native-rejection.png");
    await page.screenshot({ path: failureScreenshot, animations: "disabled" });
    evidence.rejection = { status: rejection.status(), envelope: rejectedEnvelope, response: rejectedResponse, details, unsupportedCodePoint: "U+1F525", persistedEdit: await getEdit(), acceptedExports: await getExports(), exportCheckpoints: await exportCheckpoints(page, id), screenshot: failureScreenshot, previewText: await editor.locator(".ve-caption-preview").innerText(), retainedField: await captionField.inputValue() };

    await captionField.fill(supportedCaption);
    await captionField.blur();
    await expect.poll(async () => (await getEdit()).composition.text[0]?.text).toBe(supportedCaption);
    const corrected = await getEdit();
    expect(corrected.revision).toBe(initial.revision + 1);
    expect(corrected.composition).toEqual({ ...initial.composition, text: [{ ...initial.composition.text[0], text: supportedCaption }] });
    await expect(editor.getByText("Caption 1 cannot be exported", { exact: true })).toHaveCount(0);
    await expect(exportButton).toBeEnabled();
    await expect(captionField).toHaveValue(supportedCaption);
    await expect(editor.locator(".ve-caption-preview")).toHaveText(supportedCaption);
    const correctedScreenshot = testInfo.outputPath("E20-corrected.png");
    await page.screenshot({ path: correctedScreenshot, animations: "disabled" });

    const acceptedPromise = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/projects/${id}/video-edits/${initial.id}/exports`);
    await exportButton.click();
    const acceptedResponse = await acceptedPromise;
    const freshEnvelope = CreateVideoExportSchema.parse(acceptedResponse.request().postDataJSON());
    expect(acceptedResponse.ok()).toBe(true);
    expect(freshEnvelope.revision).toBe(corrected.revision);
    expect(freshEnvelope.submissionId).not.toBe(rejectedEnvelope.submissionId);
    expect(freshEnvelope.executionDraftId).not.toBe(rejectedEnvelope.executionDraftId);
    await expect.poll(async () => (await getExports())[0]?.state, { timeout: 60000 }).toBe("ready");
    const job = (await getExports())[0];
    if (!job?.stored) throw new Error("Native export must have an immutable stored result");
    expect(job.renderer).toMatch(/^vidra-native-cfr30\/v\d+:[a-f0-9]{64}$/);
    expect(job.revision).toBe(corrected.revision);
    expect(job.composition).toEqual(corrected.composition);
    expect(await getExports()).toHaveLength(1);
    await expect.poll(() => exportCheckpoints(page, id)).toEqual([]);
    const exportPanel = page.getByRole("region", { name: "Export panel", exact: true });
    await expect(exportPanel).toHaveAttribute("data-state", "ready");
    const downloadPromise = page.waitForEvent("download");
    await exportPanel.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloadPromise; const output = testInfo.outputPath("corrected-native.mp4");
    await download.saveAs(output);
    const bytes = await readFile(output);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(job.stored.sha256);
    expect(bytes.length).toBe(job.stored.bytes);
    const probe: unknown = JSON.parse((await runNative("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", output], { timeoutMs: 30000 })).stdout);
    const streams = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string(), width: z.number().optional(), height: z.number().optional(), avg_frame_rate: z.string().optional(), nb_read_frames: z.coerce.number().optional() })) }).parse(probe).streams;
    expect(streams.find(stream => stream.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30/1", nb_read_frames: 360 });
    expect(streams.find(stream => stream.codec_type === "audio")?.codec_name).toBe("aac");
    evidence.corrected = { edit: corrected, freshEnvelope, screenshot: correctedScreenshot, job, downloadSha256: createHash("sha256").update(bytes).digest("hex"), probe };

    await exportButton.click();
    await expect(exportPanel).toHaveCount(0);
    await captionField.fill("A separate later caption");
    await captionField.blur();
    await expect.poll(async () => (await getEdit()).revision).toBe(corrected.revision + 1);
    const revisions = await getRevisions();
    expect(revisions.find(revision => revision.revision === initial.revision)).toEqual(initial);
    expect(revisions.find(revision => revision.revision === corrected.revision)).toEqual(corrected);
    expect((await getExports())[0]).toEqual(job);
    expect((await versions(page, id)).filter(source => sources.some(original => original.id === source.id)).map(source => source.object)).toEqual(sources.map(source => source.object));
    expect((await drafts(page, id)).find(draft => draft.id === retainedDraft?.id)?.instructions).toBe(words);
    expect(createHash("sha256").update(await readFile(runnerPoster)).digest("hex")).toBe(assetHashes.runner);
    expect(createHash("sha256").update(await readFile(deskPoster)).digest("hex")).toBe(assetHashes.desk);
    expect(pageErrors).toEqual([]);
    await guard(page);
    evidence.final = { laterEdit: await getEdit(), earlierRevisionsUnchanged: true, acceptedExportUnchanged: true, originalSourceObjectsUnchanged: true, independentRequestWordsRetained: true, pageErrors, guard: await (await page.request.get("/__test/state")).json() };
  } finally {
    const path = testInfo.outputPath("E20-evidence.json");
    await writeFile(path, JSON.stringify(evidence, null, 2));
    await testInfo.attach("E20 actual API/native/browser evidence", { path, contentType: "application/json" });
  }
});
