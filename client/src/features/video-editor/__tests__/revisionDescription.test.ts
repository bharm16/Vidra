import { expect, it } from "vitest";
import { VideoEditSchema, type VideoEdit } from "@shared/schemas/workflow/video-edit.schemas";
import { revisionDescription } from "../state/revisionDescription";

const item = { id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 90, displayFrames: 90, fit: "fit", sourceAudio: { muted: false, gain: 1 } } as const;
const caption = { id: "text_one", text: "Make room", anchor: { kind: "composition" }, startFrame: 0, endFrame: 60, x: .08, y: .83, width: .84, height: .12, fontSize: 32, color: "#F7F7F7", align: "center" } as const;
const music = { id: "audio_one", versionId: "version_music", sourceInFrame: 0, startFrame: 0, endFrame: 90, gain: .35 };
function edit(revision: number, composition: object): VideoEdit {
  return VideoEditSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "edit_one", ownerId: "creator", projectId: "project_one", name: "Video edit", revision, composition: { normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [item], text: [], ...composition }, issues: [], createdAt: "2026-10-17T05:00:00.000Z", updatedAt: "2026-10-17T05:00:00.000Z" });
}

it("describes each revision by its change from the revision immediately before it", () => {
  const first = edit(1, {}); const captioned = edit(2, { text: [caption] }); const scored = edit(3, { text: [caption], backgroundAudio: music }); const reworded = edit(4, { text: [{ ...caption, text: "Stay out" }], backgroundAudio: music });
  const history = [reworded, scored, captioned, first];
  expect(revisionDescription(captioned, history)).toBe("Added caption");
  expect(revisionDescription(scored, history)).toBe("Added music");
  expect(revisionDescription(reworded, history)).toBe("Changed caption");
  expect(revisionDescription(first, history)).toBe("1 clip");
});

it("names the restored revision when a revision returns to an older arrangement", () => {
  const first = edit(1, {}); const captioned = edit(2, { text: [caption] }); const scored = edit(3, { text: [caption], backgroundAudio: music });
  const restored = edit(4, structuredClone(first.composition));
  expect(revisionDescription(restored, [restored, scored, captioned, first])).toBe("Restored edit 1");
  expect(revisionDescription(edit(4, { text: [caption] }), [scored, captioned, first])).toBe("Restored edit 2");
});

it("reads the stored command, so an undo back to an older arrangement is not called a restore", () => {
  const first = edit(1, {}); const captioned = { ...edit(2, { text: [caption] }), change: { kind: "text" } } as const;
  const restored = { ...edit(3, {}), change: { kind: "restore", restoredFrom: 1 } } as const;
  const undone = { ...edit(3, {}), change: { kind: "replace_composition" } } as const;
  expect(revisionDescription(restored, [restored, captioned, first])).toBe("Restored edit 1");
  expect(revisionDescription(undone, [undone, captioned, first])).toBe("Removed caption");
  expect(revisionDescription(captioned, [captioned, first])).toBe("Added caption");
  expect(revisionDescription({ ...edit(2, { backgroundAudio: music }), change: { kind: "background_audio" } }, [first])).toBe("Added music");
  expect(revisionDescription({ ...edit(2, {}), change: { kind: "trim" } }, [first])).toBe("Changed timing");
});
