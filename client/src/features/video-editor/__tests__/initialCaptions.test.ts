import { expect, it } from "vitest";
import { VideoCompositionSchema } from "@shared/schemas/workflow/video-edit.schemas";
import { captionsFromTranscript } from "../hooks/useInitialCaptions";

const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [{ id: "item_one", versionId: "version_one", kind: "clip", inFrame: 0, outFrame: 150, displayFrames: 150, fit: "fit", sourceAudio: { muted: false, gain: 1 } }], text: [] });
const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Speaker 1>Welcome back in.\n\n00:00:04.000 --> 00:00:07.000\n<v Speaker 2>Two lanes, one start.\n\n00:00:08.000 --> 00:00:09.000\nPast the end.\n";

it("turns cues into caption elements timed to the video, with identities a repeat cannot duplicate (S10)", () => {
  const captions = captionsFromTranscript(composition, "request_caps", vtt);
  expect(captions.map(caption => [caption.id, caption.text, caption.startFrame, caption.endFrame, caption.anchor.kind])).toEqual([
    ["text_request_caps_0", "Welcome back in.", 0, 60, "composition"],
    ["text_request_caps_1", "Two lanes, one start.", 120, 150, "composition"],
  ]);
  expect(captionsFromTranscript(composition, "request_caps", "Speaker 1: a plain transcript")).toEqual([]);
});
