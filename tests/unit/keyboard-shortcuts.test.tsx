import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@promptstudio/system/components/ui/input", () => ({
  Input: ({ ...props }: InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@promptstudio/system/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const setPlatform = (platform: string) => {
  Object.defineProperty(navigator, "platform", {
    value: platform,
    configurable: true,
  });
};

async function loadKeyboardModules(platform = "MacIntel") {
  setPlatform(platform);
  vi.resetModules();
  const componentModule = await import(
    "@/components/KeyboardShortcuts/KeyboardShortcuts"
  );
  const configModule = await import(
    "@/components/KeyboardShortcuts/shortcuts.config"
  );
  const hookModule = await import(
    "@/components/KeyboardShortcuts/hooks/useKeyboardShortcuts"
  );
  const reExportModule = await import("@/components/KeyboardShortcuts");
  return {
    KeyboardShortcuts: componentModule.default,
    SHORTCUTS: configModule.SHORTCUTS,
    formatShortcut: configModule.formatShortcut,
    useKeyboardShortcuts: hookModule.useKeyboardShortcuts,
    reExport: reExportModule,
  };
}

describe("KeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("shows a no-match message when search yields no results", async () => {
      setPlatform("MacIntel");
      vi.resetModules();
      const componentModule = await import(
        "@/components/KeyboardShortcuts/KeyboardShortcuts"
      );
      const KeyboardShortcuts = componentModule.default;

      render(<KeyboardShortcuts isOpen={true} onClose={vi.fn()} />);

      fireEvent.change(
        screen.getByRole("textbox", { name: "Search actions" }),
        {
          target: { value: "nope" },
        },
      );

      expect(screen.getByText('No matches for "nope".')).toBeInTheDocument();
    }, 30000);

    it("skips copy shortcut when text is selected", async () => {
      const { useKeyboardShortcuts } = await loadKeyboardModules("MacIntel");
      const copy = vi.fn();
      const canCopy = vi.fn().mockReturnValue(true);
      const selection = {
        toString: () => "selected text",
      } as Selection;
      vi.spyOn(window, "getSelection").mockReturnValue(selection);

      renderHook(() => useKeyboardShortcuts({ copy, canCopy }));

      const event = new KeyboardEvent("keydown", {
        key: "c",
        metaKey: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(copy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("falls back to Ctrl modifier on non-Mac platforms", async () => {
      const { formatShortcut } = await loadKeyboardModules("Win32");

      expect(formatShortcut(["Cmd", "K"])).toEqual(["Ctrl", "K"]);
    });
  });
});
