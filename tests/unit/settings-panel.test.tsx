/**
 * Unit tests for Settings component
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import Settings from "@components/Settings/Settings";
import type { AppSettings } from "@components/Settings/types";

// Exercise the actual accessible primitives so dialog exports and confirmation
// behavior stay covered when the visual composition changes.
vi.unmock("@promptstudio/system/components/ui/button");
vi.unmock("@promptstudio/system/components/ui/dialog");
vi.unmock("@promptstudio/system/components/ui/switch");

const baseSettings: AppSettings = {
  fontSize: "medium",
  autoSave: true,
  exportFormat: "markdown",
};

describe("Settings", () => {
  describe("error handling", () => {
    it("handles missing clear data handler gracefully", async () => {
      const user = userEvent.setup();
      render(
        <Settings
          isOpen
          onClose={vi.fn()}
          settings={baseSettings}
          updateSetting={vi.fn()}
          resetSettings={vi.fn()}
        />,
      );

      const clearButton = screen.getByRole("button", {
        name: "Clear All Data",
      });
      expect(clearButton).toBeDisabled();
      await user.click(clearButton);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders nothing when closed", () => {
      const { container } = render(
        <Settings
          isOpen={false}
          onClose={vi.fn()}
          settings={baseSettings}
          updateSetting={vi.fn()}
          resetSettings={vi.fn()}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("core behavior", () => {
    it("updates settings via toggles and selectors", async () => {
      const user = userEvent.setup();
      const updateSetting = vi.fn();

      render(
        <Settings
          isOpen
          onClose={vi.fn()}
          settings={baseSettings}
          updateSetting={updateSetting}
          resetSettings={vi.fn()}
        />,
      );

      // Dark Mode toggle was removed in ISSUE-36 (the toggle persisted a
      // setting nothing read; the app forces a single dark theme).
      await user.click(screen.getByText("Large"));
      expect(updateSetting).toHaveBeenCalledWith("fontSize", "large");
    });

    it("confirms and executes reset settings", async () => {
      const user = userEvent.setup();
      const resetSettings = vi.fn();

      render(
        <Settings
          isOpen
          onClose={vi.fn()}
          settings={baseSettings}
          updateSetting={vi.fn()}
          resetSettings={resetSettings}
        />,
      );

      await user.click(screen.getByText("Reset Settings to Default"));
      expect(
        screen.getByText("Reset all settings to their default values?"),
      ).toBeInTheDocument();

      expect(resetSettings).not.toHaveBeenCalled();
      await user.click(screen.getByText("Yes, Reset"));

      expect(resetSettings).toHaveBeenCalled();
      expect(
        screen.queryByText("Reset all settings to their default values?"),
      ).not.toBeInTheDocument();
    });

    it("invokes clear data handler when confirmed", async () => {
      const user = userEvent.setup();
      const onClearAllData = vi.fn();

      render(
        <Settings
          isOpen
          onClose={vi.fn()}
          settings={baseSettings}
          updateSetting={vi.fn()}
          resetSettings={vi.fn()}
          onClearAllData={onClearAllData}
        />,
      );

      await user.click(screen.getByText("Clear All Data"));
      expect(onClearAllData).not.toHaveBeenCalled();
      await user.click(screen.getByText("Yes, Delete All"));

      expect(onClearAllData).toHaveBeenCalled();
    });
  });
});
