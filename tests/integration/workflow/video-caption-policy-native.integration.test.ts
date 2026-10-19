import "../../../server/src/config/native-fonts";
import { expect, it } from "vitest";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { VideoCompositionSchema, VideoTextSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { NativeVideoRenderer } from "@services/video-export/NativeVideoRenderer";
import type { ExportStorage } from "@services/video-export/ExportStorage";

const unavailableStorage = async (): Promise<never> => { throw new Error("Caption inspection must not read stored media."); };
const storage: ExportStorage = { download: unavailableStorage, remove: unavailableStorage, inspect: unavailableStorage, store: unavailableStorage, access: unavailableStorage };
const renderer = new NativeVideoRenderer(storage);
const cue = VideoTextSchema.parse({ id: "caption_source", text: "Make room for evening.", anchor: { kind: "composition" }, startFrame: 0, endFrame: 30, x: .05, y: .8, width: .9, height: .12, fontSize: 43.636, fontWeight: 500, fontFamily: "Inter", letterSpacingEm: 0, lineHeightEm: 1.3, color: "#f7f7f7", align: "center" });

it("identifies every unsupported and overflowing saved cue through qualified native caption inspection", async () => {
  const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [], text: [{ ...cue, id: "caption_glyph", text: "Make room for evening. 🌇🦊🌇" }, { ...cue, id: "caption_overflow", text: "Too many words ".repeat(8), width: .03, height: .015 }] });
  const captured = canonicalJson(composition);
  await expect(renderer.validateText(composition)).rejects.toMatchObject({
    name: "CaptionPolicyError",
    issues: [
      { elementId: "caption_glyph", code: "text_render_policy", message: expect.stringContaining("does not support"), unsupportedCodePoints: [0x1f307, 0x1f98a] },
      { elementId: "caption_overflow", code: "text_render_policy", message: expect.stringContaining("overflow") },
    ],
  });
  expect(canonicalJson(composition)).toBe(captured);
});
