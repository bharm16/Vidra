import { useEffect } from "react";
import { dispatchPromptFocusIntent } from "../events";
import { isEditableTarget } from "@components/KeyboardShortcuts/editableTarget";

/**
 * Mounts global keyboard shortcuts for the unified workspace.
 *
 * Phase 3 baseline:
 *   - ⌘K / Ctrl+K → focus the composer (via PROMPT_FOCUS_INTENT)
 *
 * Phase 3.5 follow-up (intentionally omitted here — needs an active-shot
 * + active-variant index lifted into the orchestrator):
 *   - J / K → previous / next shot
 *   - H / L → previous / next variant within the active shot
 */
export function useWorkspaceKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || key !== "k") return;

      // Skip when the user is typing — Cmd+K should jump to the composer from
      // the canvas, not hijack a keystroke from the editor itself or the
      // project rename input. This also prevents the unconditional
      // preventDefault from shadowing native shortcuts in inputs added later.
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      dispatchPromptFocusIntent({ source: "tool-rail" });
      // J/K/H/L navigation deferred to Phase 3.5 — see hook docstring.
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
