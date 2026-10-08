import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Settings from "../Settings";
import type { SettingsProps } from "../types";

const buildProps = (): SettingsProps => ({
  isOpen: true,
  onClose: vi.fn(),
  settings: { fontSize: "medium", autoSave: true, exportFormat: "markdown" },
  updateSetting: vi.fn(),
  resetSettings: vi.fn(),
  onClearAllData: vi.fn(),
});

describe("Settings preferences and destructive confirmation", () => {
  it("updates the selected preference and auto-save through the existing callbacks", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<Settings {...props} />);
    expect(screen.getByRole("button", { name: "Medium" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Large" }));
    expect(props.updateSetting).toHaveBeenCalledWith("fontSize", "large");
    await user.click(screen.getByRole("switch", { name: "Toggle auto-save" }));
    expect(props.updateSetting).toHaveBeenCalledWith("autoSave", false);
    await user.click(screen.getByRole("button", { name: "JSON" }));
    expect(props.updateSetting).toHaveBeenCalledWith("exportFormat", "json");
  });

  it("never clears data before explicit confirmation and lets Cancel leave it intact", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<Settings {...props} />);
    await user.click(screen.getByRole("button", { name: "Clear All Data" }));
    expect(
      screen.getByRole("alertdialog", { name: "Clear data confirmation" }),
    ).toBeVisible();
    expect(props.onClearAllData).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClearAllData).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear All Data" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete All" }));
    expect(props.onClearAllData).toHaveBeenCalledTimes(1);
  });

  it("disables clear data when no deletion callback is available", () => {
    const { onClearAllData, ...props } = buildProps();
    render(<Settings {...props} />);
    expect(onClearAllData).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Clear All Data" }),
    ).toBeDisabled();
  });

  it("discards a pending confirmation when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<Settings {...props} />);
    await user.click(
      screen.getByRole("button", { name: "Reset Settings to Default" }),
    );
    await user.click(screen.getByRole("button", { name: "Close settings" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.resetSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
