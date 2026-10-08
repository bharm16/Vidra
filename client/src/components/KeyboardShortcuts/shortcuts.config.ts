export interface ShortcutItem {
  keys: string[];
  description: string;
  id: string;
}

export interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

/**
 * Keyboard shortcuts configuration.
 * Defines all available shortcuts grouped by category.
 */
export const SHORTCUTS: ShortcutCategory[] = [
  {
    category: "General",
    items: [
      {
        keys: ["Cmd", "K"],
        description: "Open keyboard shortcuts",
        id: "shortcuts",
      },
      {
        keys: ["?"],
        description: "Open keyboard shortcuts",
        id: "shortcuts-help",
      },
      { keys: ["Cmd", ","], description: "Open settings", id: "settings" },
      { keys: ["Cmd", "N"], description: "Create new prompt", id: "new" },
      { keys: ["Esc"], description: "Close modal or panel", id: "escape" },
    ],
  },
  {
    category: "Prompt Actions",
    items: [
      {
        keys: ["Cmd", "Enter"],
        description: "Optimize prompt",
        id: "optimize",
      },
      {
        keys: ["Shift", "Enter"],
        description: "New line in textarea",
        id: "newline",
      },
    ],
  },
  {
    category: "Results View",
    items: [
      { keys: ["Cmd", "C"], description: "Copy optimized prompt", id: "copy" },
    ],
  },
  {
    category: "Suggestions",
    items: [
      {
        keys: ["Alt", "1-9"],
        description: "Apply suggestion",
        id: "suggestion",
      },
    ],
  },
];

// Detect if user is on Mac or Windows/Linux
export const isMac =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().indexOf("MAC") >= 0;

export const modKey = isMac ? "Cmd" : "Ctrl";

/**
 * Format shortcut keys for display, replacing 'Cmd' with platform-specific modifier.
 */
export function formatShortcut(keys: string[]): string[] {
  return keys.map((key) => (key === "Cmd" ? modKey : key));
}
