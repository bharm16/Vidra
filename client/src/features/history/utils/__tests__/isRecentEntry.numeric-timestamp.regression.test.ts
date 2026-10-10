/**
 * Regression test: isRecentEntry must handle numeric-string timestamps.
 *
 * The "Last 7 days" filter in SessionsPanel called isRecentEntry which used
 * Date.parse(). Legacy localStorage entries and some draft entries stored
 * timestamps as numeric strings (milliseconds since epoch) instead of ISO-8601
 * strings, causing Date.parse() to return NaN and hiding recent entries.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { isRecentEntry } from "../historyMedia";
import type { PromptHistoryEntry } from "@/features/prompt-optimizer/types/domain/prompt-session";

const makeEntry = (timestamp?: string): PromptHistoryEntry =>
  ({
    id: "test-1",
    uuid: "uuid-1",
    input: "test",
    output: "",
    mode: "video",
    timestamp,
  }) as unknown as PromptHistoryEntry;

describe("regression: isRecentEntry handles numeric timestamps", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts ISO-8601 string timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T12:00:00Z"));

    const twoHoursAgo = "2026-03-23T10:00:00.000Z";
    expect(isRecentEntry(makeEntry(twoHoursAgo))).toBe(true);
  });

  it("accepts numeric-string timestamps in milliseconds", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-23T12:00:00Z");
    vi.setSystemTime(now);

    const oneHourAgoMs = String(now.getTime() - 60 * 60 * 1000);
    expect(isRecentEntry(makeEntry(oneHourAgoMs))).toBe(true);
  });

  it("accepts numeric-string timestamps in seconds", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-23T12:00:00Z");
    vi.setSystemTime(now);

    const oneHourAgoSec = String(
      Math.floor((now.getTime() - 60 * 60 * 1000) / 1000),
    );
    expect(isRecentEntry(makeEntry(oneHourAgoSec))).toBe(true);
  });

  it("returns false for old numeric-string timestamps", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-23T12:00:00Z");
    vi.setSystemTime(now);

    const tenDaysAgoMs = String(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(isRecentEntry(makeEntry(tenDaysAgoMs))).toBe(false);
  });

  it("returns false for garbage strings", () => {
    expect(isRecentEntry(makeEntry("not-a-date"))).toBe(false);
    expect(isRecentEntry(makeEntry(""))).toBe(false);
  });
});
