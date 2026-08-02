import React, { useState } from "react";
import {
  X,
  Type,
  Save,
  Trash2,
  Download,
  FileText,
} from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@promptstudio/system/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { Switch } from "@promptstudio/system/components/ui/switch";
import type { SettingsProps, FontSize, ExportFormat } from "./types";

/**
 * Settings - Modal panel for managing user preferences.
 *
 * Displays settings grouped by category with toggles and selection buttons.
 * State management is handled by the useSettings hook.
 */
export default function Settings({
  isOpen,
  onClose,
  settings,
  updateSetting,
  resetSettings,
  onClearAllData,
}: SettingsProps): React.ReactElement | null {
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleResetSettings = (): void => {
    resetSettings();
    setShowConfirmReset(false);
  };

  const handleClearAllData = (): void => {
    if (onClearAllData) {
      onClearAllData();
    }
    setShowConfirmClear(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-full max-w-3xl gap-0 rounded-xl border border-border bg-surface-1 p-0 shadow-lg [&>button]:hidden">
        <Card className="border-none bg-transparent shadow-none">
          <CardHeader className="flex items-center justify-between">
            <DialogTitle
              id="settings-title"
              className="text-heading-20 text-foreground"
            >
              Settings
            </DialogTitle>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>

          <CardContent className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Appearance Section */}
            <section>
              <h3 className="text-heading-18 text-foreground mb-4">
                Appearance
              </h3>

              {/* Font Size */}
              <div className="p-4 rounded-lg border border-border bg-surface-2">
                <div className="flex items-center gap-3 mb-3">
                  <Type className="h-5 w-5 text-muted" aria-hidden="true" />
                  <label className="text-label-16 text-foreground">
                    Font Size
                  </label>
                </div>
                <div className="flex gap-2">
                  {(["small", "medium", "large"] as FontSize[]).map((size) => (
                    <Button
                      key={size}
                      onClick={() => updateSetting("fontSize", size)}
                      variant="ghost"
                      className={`
                      flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ps-focus-ring
                      ${
                        settings.fontSize === size
                          ? "bg-primary-600 text-white shadow-md scale-105"
                          : "bg-surface-1 text-foreground hover:bg-hover border border-border"
                      }
                    `}
                      aria-pressed={settings.fontSize === size}
                    >
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </section>

            {/* Behavior Section */}
            <section>
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Behavior
              </h3>

              {/* Auto-save Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-surface-2">
                <div className="flex items-center gap-3">
                  <Save
                    className="h-5 w-5 text-success-600"
                    aria-hidden="true"
                  />
                  <div>
                    <label
                      htmlFor="auto-save-toggle"
                      className="font-medium text-foreground"
                    >
                      Auto-save
                    </label>
                    <p className="text-sm text-muted">
                      Automatically save prompts to history
                    </p>
                  </div>
                </div>
                <Switch
                  id="auto-save-toggle"
                  checked={settings.autoSave}
                  onCheckedChange={(checked) =>
                    updateSetting("autoSave", checked)
                  }
                  aria-label="Toggle auto-save"
                  className="data-[state=checked]:bg-success-600"
                />
              </div>
            </section>

            {/* Export Section */}
            <section>
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Export Preferences
              </h3>

              <div className="p-4 rounded-lg border border-border bg-surface-2">
                <div className="flex items-center gap-3 mb-3">
                  <Download className="h-5 w-5 text-muted" aria-hidden="true" />
                  <label className="text-label-16 text-foreground">
                    Default Export Format
                  </label>
                </div>
                <div className="flex gap-2">
                  {[
                    { value: "text" as ExportFormat, label: "Text" },
                    { value: "markdown" as ExportFormat, label: "Markdown" },
                    { value: "json" as ExportFormat, label: "JSON" },
                  ].map((format) => (
                    <Button
                      key={format.value}
                      onClick={() =>
                        updateSetting("exportFormat", format.value)
                      }
                      variant="ghost"
                      className={`
                      flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ps-focus-ring
                      ${
                        settings.exportFormat === format.value
                          ? "bg-primary-600 text-white shadow-md scale-105"
                          : "bg-surface-1 text-foreground hover:bg-hover border border-border"
                      }
                    `}
                      aria-pressed={settings.exportFormat === format.value}
                    >
                      {format.label}
                    </Button>
                  ))}
                </div>
              </div>
            </section>

            {/* Danger Zone */}
            <section>
              <h3 className="text-heading-18 text-error-600 mb-4">
                Danger Zone
              </h3>

              <div className="space-y-3">
                {/* Reset Settings */}
                {!showConfirmReset ? (
                  <Button
                    onClick={() => setShowConfirmReset(true)}
                    variant="secondary"
                    className="w-full hover:border-warning-400 hover:bg-warning-50"
                  >
                    <FileText className="h-4 w-4" />
                    Reset Settings to Default
                  </Button>
                ) : (
                  <div className="p-4 rounded-lg border-2 border-warning-300 bg-warning-50">
                    <p className="text-sm text-warning-900 mb-3">
                      Are you sure? This will reset all settings to their
                      default values.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleResetSettings}
                        size="sm"
                        variant="default"
                        className="flex-1 bg-warning-600 hover:bg-warning-700 text-white"
                      >
                        Yes, Reset
                      </Button>
                      <Button
                        onClick={() => setShowConfirmReset(false)}
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Clear All Data */}
                {!showConfirmClear ? (
                  <Button
                    onClick={() => setShowConfirmClear(true)}
                    variant="secondary"
                    className="w-full hover:border-error-400 hover:bg-error-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear All Data
                  </Button>
                ) : (
                  <div className="p-4 rounded-lg border-2 border-error-300 bg-error-50">
                    <p className="text-sm text-error-900 mb-3">
                      Are you sure? This will permanently delete all your saved
                      prompts and history.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleClearAllData}
                        size="sm"
                        variant="default"
                        className="flex-1 bg-error-600 hover:bg-error-700 text-white"
                      >
                        Yes, Delete All
                      </Button>
                      <Button
                        onClick={() => setShowConfirmClear(false)}
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </CardContent>

          <CardFooter className="flex items-center justify-between">
            <p className="text-xs text-muted">
              Settings are saved automatically
            </p>
            <Button onClick={onClose} variant="default">
              Done
            </Button>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
