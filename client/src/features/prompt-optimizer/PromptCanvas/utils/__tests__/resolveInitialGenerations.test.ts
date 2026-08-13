import { describe, expect, it } from "vitest";
import type { Generation } from "@features/generations/types";
import { resolveInitialGenerations } from "../resolveInitialGenerations";

const makeGeneration = (id: string): Generation => ({
  id,
  tier: "draft",
  status: "completed",
  model: "wan-2.2",
  prompt: "Prompt",
  promptVersionId: "v-1",
  createdAt: Date.now(),
  completedAt: Date.now(),
  mediaType: "video",
  mediaUrls: ["https://example.com/video.mp4"],
});

describe("resolveInitialGenerations", () => {
  it("clears generations when no words-version is selected", () => {
    expect(resolveInitialGenerations(undefined, "")).toEqual([]);
  });

  it("preserves the panel's own state when an existing version is selected", () => {
    expect(resolveInitialGenerations(undefined, "v-1")).toBeUndefined();
  });

  it("passes through explicit generations", () => {
    const generations = [makeGeneration("gen-1")];
    expect(resolveInitialGenerations(generations, "v-1")).toEqual(generations);
  });
});
