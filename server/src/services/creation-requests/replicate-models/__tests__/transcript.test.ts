import { expect, it } from "vitest";
import { MAX_TRANSCRIPT_CHARACTERS, formatTranscript } from "../transcript";

const spoken = {
  text: "Hello there. (laughter) Welcome.",
  language_code: "en",
  language_probability: 0.97,
  words: [
    {
      text: "Hello",
      type: "word",
      start: 0.1,
      end: 0.5,
      speaker_id: "speaker_0",
    },
    {
      text: " ",
      type: "spacing",
      start: 0.5,
      end: 0.6,
      speaker_id: "speaker_0",
    },
    {
      text: "there.",
      type: "word",
      start: 0.6,
      end: 1.0,
      speaker_id: "speaker_0",
    },
    {
      text: " ",
      type: "spacing",
      start: 1.0,
      end: 1.1,
      speaker_id: "speaker_0",
    },
    {
      text: "(laughter)",
      type: "audio_event",
      start: 1.1,
      end: 1.9,
      speaker_id: "speaker_0",
    },
    {
      text: " ",
      type: "spacing",
      start: 1.9,
      end: 2.0,
      speaker_id: "speaker_0",
    },
    {
      text: "Welcome.",
      type: "word",
      start: 2.0,
      end: 2.6,
      speaker_id: "speaker_1",
    },
  ],
};

it("writes WebVTT captions with speakers, sound events and inline word timing", () => {
  const vtt = formatTranscript(spoken, "word");
  expect(vtt).toBe(
    [
      "WEBVTT",
      "",
      "NOTE Language en (97% confidence)",
      "",
      "00:00:00.100 --> 00:00:01.000",
      "<v Speaker 1>Hello <00:00:00.600>there.",
      "",
      "00:00:01.100 --> 00:00:01.900",
      "<v Speaker 1>(laughter)",
      "",
      "00:00:02.000 --> 00:00:02.600",
      "<v Speaker 2>Welcome.",
      "",
    ].join("\n"),
  );
});

it("uses character timing when the provider supplies it", () => {
  const vtt = formatTranscript(
    {
      ...spoken,
      words: [
        {
          text: "Hi",
          type: "word",
          start: 0,
          end: 0.4,
          characters: [
            { text: "H", start: 0, end: 0.2 },
            { text: "i", start: 0.2, end: 0.4 },
          ],
        },
      ],
    },
    "character",
  );
  expect(vtt).toContain("H<00:00:00.200>i");
});

it("returns the plain transcript, one paragraph per speaker, without timing", () => {
  expect(formatTranscript(spoken, "none")).toBe(
    "Speaker 1: Hello there. (laughter)\n\nSpeaker 2: Welcome.",
  );
  expect(formatTranscript({ ...spoken, words: [] }, "word")).toBe(
    "Hello there. (laughter) Welcome.",
  );
});

it("drops inline timing before it would drop words from a long transcript", () => {
  const words = Array.from({ length: 1800 }, (_, index) => [
    { text: "word", type: "word", start: index * 0.3, end: index * 0.3 + 0.25 },
    {
      text: " ",
      type: "spacing",
      start: index * 0.3 + 0.25,
      end: index * 0.3 + 0.3,
    },
  ]).flat();
  const vtt = formatTranscript(
    {
      text: "word ".repeat(1800),
      language_code: "en",
      language_probability: 1,
      words,
    },
    "word",
  );
  expect(vtt.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARACTERS);
  expect(vtt).toContain("-->");
  expect(vtt).not.toMatch(/<\d{2}:\d{2}/);
  expect(vtt.match(/word/g)).toHaveLength(1800);
});
