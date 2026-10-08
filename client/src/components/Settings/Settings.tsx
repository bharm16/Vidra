import React, { useState } from "react";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@promptstudio/system/components/ui/dialog";
import { Switch } from "@promptstudio/system/components/ui/switch";
import settingsClose from "@/assets/design-system/settings-close.svg";
import type { SettingsProps, FontSize, ExportFormat } from "./types";
import "./settings.css";

const FONT_SIZES: FontSize[] = ["small", "medium", "large"];
const FORMATS: Array<{ value: ExportFormat; label: string }> = [
  { value: "text", label: "Text" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
];

/** Page 21 Settings, node 703:302624; callbacks retain their existing scope. */
export default function Settings({
  isOpen,
  onClose,
  settings,
  updateSetting,
  resetSettings,
  onClearAllData,
}: SettingsProps): React.ReactElement | null {
  const [confirmation, setConfirmation] = useState<"reset" | "clear" | null>(
    null,
  );
  const closeDialog = (): void => {
    setConfirmation(null);
    onClose();
  };
  if (!isOpen) return null;
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent
        hideClose
        className="ps-settings-dialog max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[640px] gap-5 overflow-y-auto rounded-xl border-0 bg-chrome p-6 ring-[0.5px] ring-inset ring-[color:var(--settings-native-outline)]"
      >
        <header className="flex h-9 items-center justify-between">
          <DialogTitle className="text-body-lg font-normal">
            Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Appearance, saving and export preferences
          </DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-md"
            onClick={closeDialog}
            aria-label="Close settings"
          >
            <img src={settingsClose} alt="" />
          </Button>
        </header>
        <div className="h-px bg-border" />
        <section className="space-y-2">
          <h3 className="text-meta text-foreground">Appearance</h3>
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <span className="text-ui font-normal">Font Size</span>
            <div
              className="flex h-8 w-[228px] overflow-hidden rounded-[var(--vidra-radius-segment)] bg-[var(--settings-native-segment)] ring-[0.5px] ring-inset ring-[color:var(--settings-native-outline)]"
              role="group"
              aria-label="Font size"
            >
              {FONT_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant="ghost"
                  onClick={() => updateSetting("fontSize", size)}
                  aria-pressed={settings.fontSize === size}
                  className={
                    "h-8 flex-1 rounded-none px-0 text-meta font-normal " +
                    (settings.fontSize === size
                      ? "bg-[var(--settings-native-primary)] text-primary-foreground hover:bg-[var(--settings-native-primary)]"
                      : "bg-secondary text-foreground hover:bg-hover")
                  }
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-meta text-foreground">Behavior</h3>
          <div className="flex min-h-11 items-center justify-between">
            <div className="flex flex-col gap-1">
              <label htmlFor="auto-save-toggle" className="text-ui font-normal">
                Auto-save
              </label>
              <p className="text-meta text-foreground">
                Automatically save prompts to history
              </p>
            </div>
            <Switch
              id="auto-save-toggle"
              checked={settings.autoSave}
              onCheckedChange={(checked) => updateSetting("autoSave", checked)}
              className="data-[state=checked]:bg-[var(--settings-native-primary)]"
              aria-label="Toggle auto-save"
            />
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-meta text-foreground">Export Preferences</h3>
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <span className="text-ui font-normal">Default Export Format</span>
            <div
              className="flex h-8 w-[228px] overflow-hidden rounded-[var(--vidra-radius-segment)] bg-[var(--settings-native-segment)] ring-[0.5px] ring-inset ring-[color:var(--settings-native-outline)]"
              role="group"
              aria-label="Default export format"
            >
              {FORMATS.map((format) => (
                <Button
                  key={format.value}
                  type="button"
                  variant="ghost"
                  onClick={() => updateSetting("exportFormat", format.value)}
                  aria-pressed={settings.exportFormat === format.value}
                  className={
                    "h-8 flex-1 rounded-none px-0 text-meta font-normal " +
                    (settings.exportFormat === format.value
                      ? "bg-[var(--settings-native-primary)] text-primary-foreground hover:bg-[var(--settings-native-primary)]"
                      : "bg-secondary text-foreground hover:bg-hover")
                  }
                >
                  {format.label}
                </Button>
              ))}
            </div>
          </div>
        </section>
        <div className="h-px bg-border" />
        <section className="space-y-2">
          <h3 className="text-meta text-foreground">Danger Zone</h3>
          {confirmation ? (
            <div
              role="alertdialog"
              aria-label={
                confirmation === "reset"
                  ? "Reset settings confirmation"
                  : "Clear data confirmation"
              }
              className="rounded-card border border-border p-4"
            >
              <p className="mb-3 text-ui">
                {confirmation === "reset"
                  ? "Reset all settings to their default values?"
                  : "Permanently delete your saved prompts and history?"}
              </p>
              <div className="flex gap-2">
                <Button
                  variant={confirmation === "clear" ? "destructive" : "default"}
                  onClick={() => {
                    if (confirmation === "reset") resetSettings();
                    else onClearAllData?.();
                    setConfirmation(null);
                  }}
                >
                  {confirmation === "reset" ? "Yes, Reset" : "Yes, Delete All"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmation(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                className="w-[264px]"
                onClick={() => setConfirmation("reset")}
              >
                Reset Settings to Default
              </Button>
              <Button
                variant="secondary"
                className="w-[160px] text-muted"
                disabled={!onClearAllData}
                onClick={() => setConfirmation("clear")}
              >
                Clear All Data
              </Button>
            </div>
          )}
        </section>
        <div className="h-px bg-border" />
        <footer className="flex items-center justify-between gap-3">
          <p className="text-meta text-foreground">
            Settings are saved automatically
          </p>
          <Button
            className="w-[88px] bg-[var(--settings-native-primary)]"
            onClick={closeDialog}
          >
            Done
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
