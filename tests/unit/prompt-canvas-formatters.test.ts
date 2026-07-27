import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { formatTimestamp } from "@features/prompt-optimizer/PromptCanvas/utils/promptCanvasFormatters";

describe("promptCanvasFormatters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats timestamps relative to now", () => {
    const now = Date.now();
    expect(formatTimestamp(now)).toBe("just now");
    expect(formatTimestamp(now - 5 * 60 * 1000)).toBe("5m ago");
    expect(formatTimestamp(now - 2 * 60 * 60 * 1000)).toBe("2h ago");
    expect(formatTimestamp(now - 3 * 24 * 60 * 60 * 1000)).toBe("3d ago");
  });
});
