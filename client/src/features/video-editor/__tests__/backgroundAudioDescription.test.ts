import { expect, it } from "vitest";
import { backgroundAudioDescription } from "../state/backgroundAudioDescription";

it.each([
  ["audio/wav", "WAV"], ["Audio/X-WAV; codecs=1", "WAV"], ["audio/mpeg", "MP3"], ["audio/mp4", "M4A"], ["audio/opus", "OGG"],
])("uses the recorded %s MIME and actual seconds", (mime, name) => {
  expect(backgroundAudioDescription("audio", mime, 24)).toBe(`${name} · 24 seconds`);
});

it("retains fractional duration and uses singular seconds accurately", () => {
  expect(backgroundAudioDescription("audio", "audio/wav", 1)).toBe("WAV · 1 second");
  expect(backgroundAudioDescription("audio", "audio/wav", 1.25)).toBe("WAV · 1.25 seconds");
  expect(backgroundAudioDescription("audio", "audio/wav", 20)).toBe("WAV · 20 seconds");
});

it.each([1.0001, .9999])("uses singular grammar when actual duration %s rounds to one displayed second", duration => {
  expect(backgroundAudioDescription("audio", "audio/wav", duration)).toBe("WAV · 1 second");
});

it("describes retained video soundtracks and unknown formats without inventing WAV", () => {
  expect(backgroundAudioDescription("video", "video/mp4", 4)).toBe("MP4 · 4 seconds");
  expect(backgroundAudioDescription("export", undefined, 12)).toBe("Video · 12 seconds");
  expect(backgroundAudioDescription("audio", "application/octet-stream", 20)).toBe("Audio · 20 seconds");
  expect(backgroundAudioDescription("audio", undefined, 20)).toBe("Audio · 20 seconds");
});

it.each([undefined, NaN, Infinity, -1])("omits unavailable duration %s", duration => {
  expect(backgroundAudioDescription("audio", "audio/wav", duration)).toBe("WAV");
});
