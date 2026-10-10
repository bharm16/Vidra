/**
 * Unit tests for useSettingsStorage
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useSettingsStorage } from "@components/Settings/hooks/useSettingsStorage";
import type { AppSettings } from "@components/Settings/types";

const STORAGE_KEY = "app-settings";

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: "medium",
  autoSave: true,
  exportFormat: "markdown",
};

describe("useSettingsStorage", () => {
  const originalGetItem = localStorage.getItem;
  const originalSetItem = localStorage.setItem;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.getItem = originalGetItem;
    localStorage.setItem = originalSetItem;
  });

  describe("error handling", () => {
    it("falls back to defaults when storage contains invalid JSON", () => {
      localStorage.getItem = vi.fn(() => "{not-json");

      const { result } = renderHook(() => useSettingsStorage());

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });

    it("falls back to defaults when stored schema is invalid", () => {
      localStorage.getItem = vi.fn(() => JSON.stringify({ fontSize: "giant" }));

      const { result } = renderHook(() => useSettingsStorage());

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("edge cases", () => {
    it("strips legacy 'darkMode' field from persisted values without losing the rest", () => {
      // Migration safety for ISSUE-36: users with pre-existing localStorage
      // entries that include `darkMode` must continue to load cleanly. Zod's
      // .partial().strip() (the default) drops the unknown field; the rest
      // of the settings should hydrate normally.
      localStorage.getItem = vi.fn(() =>
        JSON.stringify({
          darkMode: true,
          fontSize: "large",
          autoSave: false,
          exportFormat: "json",
        }),
      );

      const { result } = renderHook(() => useSettingsStorage());

      expect(result.current.settings).toEqual({
        fontSize: "large",
        autoSave: false,
        exportFormat: "json",
      });
      expect(result.current.settings).not.toHaveProperty("darkMode");
    });
  });

  describe("core behavior", () => {
    it("persists updated settings to storage", async () => {
      const { result } = renderHook(() => useSettingsStorage());

      act(() => {
        result.current.setSettings((prev) => ({
          ...prev,
          fontSize: "small",
        }));
      });

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          STORAGE_KEY,
          JSON.stringify({
            fontSize: "small",
            autoSave: true,
            exportFormat: "markdown",
          }),
        );
      });
    });
  });
});
