import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  formatShortDate,
  formatRelativeOrDate,
} from "@features/history/utils/historyDates";

describe("historyDates", () => {
  const baseTime = new Date("2024-05-10T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("error handling", () => {
    it('returns "No date" when a short date is missing or invalid', () => {
      expect(formatShortDate(undefined)).toBe("No date");
      expect(formatShortDate("not-a-date")).toBe("No date");
    });

    it('returns "No date" when a relative date is invalid', () => {
      expect(formatRelativeOrDate("invalid-date")).toBe("No date");
      expect(formatRelativeOrDate(undefined)).toBe("No date");
    });
  });

  describe("edge cases", () => {
    it("falls back to the short date when the timestamp is in the future", () => {
      const future = new Date(
        baseTime.getTime() + 2 * 60 * 60 * 1000,
      ).toISOString();

      expect(formatRelativeOrDate(future)).toBe(formatShortDate(future));
    });
  });

  describe("core behavior", () => {
    it("formats minutes, hours, and days relative to now", () => {
      const minutesAgo = new Date(
        baseTime.getTime() - 30 * 60 * 1000,
      ).toISOString();
      const hoursAgo = new Date(
        baseTime.getTime() - 2 * 60 * 60 * 1000,
      ).toISOString();
      const daysAgo = new Date(
        baseTime.getTime() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();

      expect(formatRelativeOrDate(minutesAgo)).toBe("30m ago");
      expect(formatRelativeOrDate(hoursAgo)).toBe("2h ago");
      expect(formatRelativeOrDate(daysAgo)).toBe("3d ago");
    });
  });
});
