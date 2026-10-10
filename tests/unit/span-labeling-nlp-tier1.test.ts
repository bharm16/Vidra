import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { extractPatternSpans } from "@llm/span-labeling/nlp/tier1/patterns";
import { extractClosedVocabulary } from "@llm/span-labeling/nlp/tier1/closedVocabulary";
import { deduplicateSpans } from "@llm/span-labeling/nlp/merge";
import { filterSectionHeaders } from "@llm/span-labeling/nlp/filters/sectionHeaders";
import SpanLabelingConfig from "@llm/span-labeling/config/SpanLabelingConfig";

import type { NlpSpan } from "@llm/span-labeling/nlp/types";

describe("tier1 patterns", () => {
  it("extracts technical pattern spans", () => {
    const text =
      "Shot at 24fps in 16:9 aspect ratio with 4k resolution and f/2.8.";
    const spans = extractPatternSpans(text);
    const roles = spans.map((span) => span.role);

    expect(roles).toContain("technical.frameRate");
    expect(roles).toContain("technical.aspectRatio");
    expect(roles).toContain("technical.resolution");
    expect(roles).toContain("camera.focus");
  });

  it("requires aspect ratio context for uncommon ratios", () => {
    const text = "Use an aspect ratio of 2:5 for the frame.";
    const spans = extractPatternSpans(text);
    expect(
      spans.some(
        (span) =>
          span.role === "technical.aspectRatio" && span.text.includes("2:5"),
      ),
    ).toBe(true);
  });
});

describe("closed vocabulary extraction", () => {
  it("matches known vocab terms with safe word boundaries", () => {
    const text = "Pan across the scene.";
    const spans = extractClosedVocabulary(text);
    expect(spans.some((span) => span.text.toLowerCase() === "pan")).toBe(true);
  });

  it("avoids matches inside larger words", () => {
    const text = "Panning across the scene.";
    const spans = extractClosedVocabulary(text);
    expect(spans.some((span) => span.text.toLowerCase() === "pan")).toBe(false);
  });
});

describe("merge and deduplicate spans", () => {
  const setClosedVocabPriority = (value: boolean) => {
    (
      SpanLabelingConfig.NEURO_SYMBOLIC.MERGE as {
        CLOSED_VOCAB_PRIORITY: boolean;
      }
    ).CLOSED_VOCAB_PRIORITY = value;
  };

  const originalClosedPriority =
    SpanLabelingConfig.NEURO_SYMBOLIC.MERGE.CLOSED_VOCAB_PRIORITY;

  beforeEach(() => {
    setClosedVocabPriority(true);
  });

  afterEach(() => {
    setClosedVocabPriority(originalClosedPriority);
  });

  it("prefers closed-vocabulary spans when overlapping with open vocab", () => {
    const spans: NlpSpan[] = [
      {
        text: "Zoom",
        start: 0,
        end: 4,
        role: "camera.movement",
        confidence: 0.8,
        source: "gliner",
      },
      {
        text: "Zoom",
        start: 0,
        end: 4,
        role: "camera",
        confidence: 0.4,
        source: "pattern",
      },
    ];

    const result = deduplicateSpans(spans);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("pattern");
    expect(result[0]?.role).toBe("camera");
  });
});

describe("section header filtering", () => {
  it("filters spans that are section headers", () => {
    const text = "## Camera\nPan shot";
    const spans: NlpSpan[] = [
      {
        text: "Camera",
        start: text.indexOf("Camera"),
        end: text.indexOf("Camera") + 6,
        role: "camera",
        confidence: 0.9,
      },
      {
        text: "Pan shot",
        start: text.indexOf("Pan shot"),
        end: text.indexOf("Pan shot") + 8,
        role: "camera.movement",
        confidence: 0.9,
      },
    ];

    const filtered = filterSectionHeaders(text, spans);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.text).toBe("Pan shot");
  });

  it("keeps spans that are not header contexts", () => {
    const text = "The camera pans smoothly.";
    const spans: NlpSpan[] = [
      {
        text: "camera",
        start: text.indexOf("camera"),
        end: text.indexOf("camera") + 6,
        role: "camera",
        confidence: 0.9,
      },
    ];

    const filtered = filterSectionHeaders(text, spans);
    expect(filtered).toHaveLength(1);
  });
});
