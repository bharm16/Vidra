import "../../../config/native-fonts";
import { open, readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { VideoCompositionSchema, VideoTextSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { rasterizeCaption } from "../CaptionRasterizer";
import { CaptionPolicyError } from "../CaptionPolicyError";
import { NativeVideoRenderer } from "../NativeVideoRenderer";
import type { ExportStorage } from "../ExportStorage";

vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, readFile: vi.fn(original.readFile), open: vi.fn(original.open) };
});
afterEach(() => vi.clearAllMocks());
const cue = VideoTextSchema.parse({ id: "caption", text: "Make room for evening.", anchor: { kind: "composition" }, startFrame: 0, endFrame: 30, x: .05, y: .8, width: .9, height: .12, fontSize: 43.636, fontWeight: 500, fontFamily: "Inter", letterSpacingEm: 0, lineHeightEm: 1.3, color: "#f7f7f7", align: "center" });

it.each(["ENOENT", "EACCES"])("preserves a %s font-file fault as a backend failure", async code => {
  const failure = Object.assign(new Error("The bundled font file is unavailable."), { code });
  vi.mocked(readFile).mockRejectedValueOnce(failure);
  await expect(rasterizeCaption(cue, "landscape")).rejects.toBe(failure);
  expect(failure).not.toBeInstanceOf(CaptionPolicyError);
});

it("keeps an unqualified bundled font distinct from unsupported caption content", async () => {
  vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("different unqualified font bytes"));
  await expect(rasterizeCaption(cue, "landscape")).rejects.toMatchObject({ name: "Error", message: expect.stringContaining("caption font is not qualified") });
});

it("propagates a native layout-file fault despite previously identified unsupported glyphs", async () => {
  const failure = new Error("Text caption: the words overflow this text box.");
  vi.mocked(open).mockRejectedValueOnce(failure);
  const noMedia = async (): Promise<never> => { throw new Error("Caption validation cannot read stored media."); };
  const storage: ExportStorage = { download: noMedia, remove: noMedia, inspect: noMedia, store: noMedia, access: noMedia };
  const renderer = new NativeVideoRenderer(storage);
  const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [], text: [{ ...cue, id: "unsupported", text: "🌇" }, cue] });
  await expect(renderer.validateText(composition)).rejects.toBe(failure);
  expect(failure).not.toBeInstanceOf(CaptionPolicyError);
});
