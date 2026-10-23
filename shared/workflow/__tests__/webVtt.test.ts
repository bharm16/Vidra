import { expect, it } from "vitest";
import { cueTime, parseWebVtt } from "../webVtt";

it("reads cues with their time and speaker, dropping inline word timings", () => {
  const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Speaker 1>Welcome <00:00:01.000>back in.\n\n00:01:04.500 --> 00:01:07.000\n[applause]\n";
  expect(parseWebVtt(vtt)).toEqual([
    { start: 0, end: 2, speaker: "Speaker 1", text: "Welcome back in." },
    { start: 64.5, end: 67, text: "[applause]" },
  ]);
  expect(cueTime(64.5)).toBe("1:04");
});

it("treats a transcript without timing as words, not captions", () => {
  expect(parseWebVtt("Speaker 1: Welcome back in.")).toBeUndefined();
});
