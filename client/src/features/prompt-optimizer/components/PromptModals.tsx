import React from "react";
import Settings, { useSettings } from "@components/Settings";
import KeyboardShortcuts from "@components/KeyboardShortcuts";
import {
  usePromptServices,
  usePromptUIStateContext,
} from "../context/PromptStateContext";

/** Only active application preferences remain; dormant improver/brainstorm UI is unregistered. */
export function PromptModals(): React.ReactElement {
  const { showSettings, setShowSettings, showShortcuts, setShowShortcuts } =
    usePromptUIStateContext();
  const { promptHistory } = usePromptServices();
  const { settings, updateSetting, resetSettings } = useSettings();
  return (
    <>
      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        updateSetting={updateSetting}
        resetSettings={resetSettings}
        onClearAllData={promptHistory.clearHistory}
      />
      <KeyboardShortcuts
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </>
  );
}
