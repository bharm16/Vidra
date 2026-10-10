import { describe, it, expect } from "vitest";
import { CacheService } from "@services/cache/CacheService";
import {
  CacheKeyFactory,
  type EnhancementCacheParams,
} from "../CacheKeyFactory";

const params = (): EnhancementCacheParams => ({
  engineVersion: "v2",
  highlightedText: "a runner",
  contextBefore: "",
  contextAfter: "",
  fullPrompt: "a runner in the rain",
  originalUserPrompt: "a runner",
  isVideoPrompt: true,
  brainstormSignature: null,
  highlightedCategory: "subject.identity",
  highlightWordCount: 2,
  phraseRole: "subject.identity",
  videoConstraints: null,
  editHistory: [],
  modelTarget: "wan-2.2",
  promptSection: null,
  policyVersion: "2026-03-v2a",
  spanFingerprint: null,
});

describe("CacheKeyFactory", () => {
  it("produces distinct keys for prompts that differ only after the old truncation point", () => {
    const cache = new CacheService();
    const sharedPrefix = "a".repeat(6500);
    const keyA = CacheKeyFactory.generateKey(
      "enhancement",
      { ...params(), fullPrompt: sharedPrefix + " ending one" },
      cache,
    );
    const keyB = CacheKeyFactory.generateKey(
      "enhancement",
      { ...params(), fullPrompt: sharedPrefix + " ending two" },
      cache,
    );
    expect(keyA).not.toEqual(keyB);
  });

  it("produces distinct keys for originalUserPrompts that differ only after the old 500-char limit", () => {
    const cache = new CacheService();
    const sharedPrefix = "z".repeat(600);
    const keyA = CacheKeyFactory.generateKey(
      "enhancement",
      { ...params(), originalUserPrompt: sharedPrefix + " A" },
      cache,
    );
    const keyB = CacheKeyFactory.generateKey(
      "enhancement",
      { ...params(), originalUserPrompt: sharedPrefix + " B" },
      cache,
    );
    expect(keyA).not.toEqual(keyB);
  });
});
