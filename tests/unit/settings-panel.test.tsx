/**
 * Unit tests for Settings component
 */

/**
 * Unit tests for Settings component
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  describe("core behavior", () => {
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
  });
});
