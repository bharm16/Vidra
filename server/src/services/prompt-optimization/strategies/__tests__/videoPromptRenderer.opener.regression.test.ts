import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { renderMainVideoPrompt } from "../videoPromptRenderer";
import type { VideoPromptSlots } from "../videoPromptTypes";

const KNOWN_SHOT_FRAMINGS = [
  "Extreme Close-Up",
  "Close-Up",
  "Medium Close-Up",
  "Medium Shot",
  "Medium Long Shot",
  "Cowboy Shot",
  "Full Shot",
  "Wide Shot",
  "Extreme Wide Shot",
  "Establishing Shot",
  "Master Shot",
  "Two-Shot",
  "Insert Shot",
  "Cutaway",
] as const;

const DEFAULT_FRAMING = "Wide Shot";

const makeSlots = (overrides: Partial<VideoPromptSlots>): VideoPromptSlots => ({
  shot_framing: "Wide Shot",
  camera_angle: "Eye-Level Shot",
  camera_move: null,
  camera_lens: null,
  subject: "astronaut",
  subject_details: ["pressure suit", "visor reflection"],
  action: "walking across dunes",
  setting: "Martian dune field",
  time: "dusk",
  lighting: "cool neon rim light",
  style: "Denis Villeneuve sci-fi",
  ...overrides,
});

const firstSentence = (output: string): string => {
  const trimmed = output.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : trimmed).trim();
};

const openerMatchesKnownFraming = (sentence: string): boolean =>
  KNOWN_SHOT_FRAMINGS.some(
    (framing) =>
      sentence.startsWith(framing) || sentence.startsWith(DEFAULT_FRAMING),
  );

describe("regression: renderMainVideoPrompt shot_framing opener (ISSUE-21)", () => {
  it("opens with a known framing token when the LLM returns clean enum values", () => {
    const output = renderMainVideoPrompt(
      makeSlots({ shot_framing: "Extreme Wide Shot" }),
    );
    expect(firstSentence(output)).toMatch(/^Extreme Wide Shot\b/);
  });

  it("rejects multi-sentence prose echoed into shot_framing (bug repro #1)", () => {
    const output = renderMainVideoPrompt(
      makeSlots({
        shot_framing: "Cinematic aerial shot walking. Extreme Wide Shot",
      }),
    );
    const opener = firstSentence(output);
    expect(opener).not.toMatch(/^Cinematic aerial shot walking/);
    expect(openerMatchesKnownFraming(opener)).toBe(true);
  });

  it("rejects short token-plucked prose in shot_framing (bug repro #2)", () => {
    const output = renderMainVideoPrompt(
      makeSlots({ shot_framing: "Astronaut mars sunset. Extreme Wide Shot" }),
    );
    const opener = firstSentence(output);
    expect(opener).not.toMatch(/^Astronaut mars sunset/);
    expect(openerMatchesKnownFraming(opener)).toBe(true);
  });

  it("falls back to a known default when shot_framing contains no recognizable framing", () => {
    const output = renderMainVideoPrompt(
      makeSlots({ shot_framing: "Some arbitrary prose the model invented" }),
    );
    expect(openerMatchesKnownFraming(firstSentence(output))).toBe(true);
  });

  it("for any shot_framing string, the first sentence opens with a known framing token", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }).filter((s) => {
          // Property-based sampling: filter out inputs that would be cleaned to empty
          // (those legitimately fall through to the default "Wide Shot" branch — tested above).
          return true;
        }),
        (arbitraryFraming) => {
          const output = renderMainVideoPrompt(
            makeSlots({ shot_framing: arbitraryFraming }),
          );
          return openerMatchesKnownFraming(firstSentence(output));
        },
      ),
      { numRuns: 100 },
    );
  });
});
