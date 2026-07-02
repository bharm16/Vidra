import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Command, Search } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@promptstudio/system/components/ui/dialog";
import { Input } from "@promptstudio/system/components/ui/input";
import { SHORTCUTS, formatShortcut, isMac } from "./shortcuts.config";

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * KeyboardShortcuts - Modal panel displaying available keyboard shortcuts.
 *
 * Shows all shortcuts grouped by category with platform-specific key labels.
 */
export default function KeyboardShortcuts({
  isOpen,
  onClose,
}: KeyboardShortcutsProps): React.ReactElement | null {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  const filteredShortcuts = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return SHORTCUTS;
    return SHORTCUTS.map((category) => {
      const items = category.items.filter((shortcut) => {
        const haystack =
          `${shortcut.description} ${shortcut.keys.join(" ")}`.toLowerCase();
        return haystack.includes(trimmed);
      });
      return { ...category, items };
    }).filter((category) => category.items.length > 0);
  }, [query]);

  const totalMatches = useMemo(
    () =>
      filteredShortcuts.reduce(
        (sum, category) => sum + category.items.length,
        0,
      ),
    [filteredShortcuts],
  );

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface-1 p-0 shadow-lg [&>button]:hidden">
        <div
          className="h-1 bg-gradient-to-r from-accent to-accent-2"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3 text-h4 font-semibold tracking-tight text-foreground">
            <Command className="h-4 w-4" aria-hidden="true" />
            <span id="command-title">Command Palette</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md border border-border bg-surface-3 text-muted transition-all duration-150 hover:-translate-y-px hover:border-border-strong"
            onClick={onClose}
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          className="mx-6 mb-5 flex items-center gap-3 rounded-lg border border-border bg-surface-3 px-3 py-2.5 text-faint"
          role="search"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions"
            aria-label="Search actions"
            className="h-auto border-none bg-transparent p-0 text-body-sm text-foreground"
          />
        </div>

        <div
          className="flex max-h-screen flex-col gap-5 overflow-y-auto px-6 pb-5"
          role="list"
        >
          {totalMatches === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-surface-2 p-6 text-center text-faint">
              No matches for "{query.trim()}".
            </div>
          ) : (
            filteredShortcuts.map((category) => (
              <section key={category.category} aria-label={category.category}>
                <div className="mb-2 text-label-sm uppercase tracking-widest text-faint">
                  {category.category}
                </div>
                <div className="flex flex-col gap-2">
                  {category.items.map((shortcut) => {
                    const formattedKeys = formatShortcut(shortcut.keys);
                    return (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between gap-4 rounded-md border border-transparent bg-surface-2 px-3 py-2.5 text-muted transition-colors duration-150 hover:border-border-strong hover:bg-surface-3 hover:text-foreground"
                        role="listitem"
                      >
                        <span>{shortcut.description}</span>
                        <div
                          className="flex items-center gap-2 text-faint"
                          aria-label={`Shortcut: ${shortcut.keys.join(" + ")}`}
                        >
                          {formattedKeys.map((key, keyIdx) => (
                            <React.Fragment key={`${shortcut.id}-${key}`}>
                              <kbd className="min-w-7 rounded-sm border border-border bg-surface-3 px-1.5 py-0.5 text-label-sm font-mono text-muted">
                                {key === "Cmd" || key === "Ctrl" ? (
                                  <Command
                                    className="h-3 w-3"
                                    aria-label={key}
                                  />
                                ) : (
                                  key
                                )}
                              </kbd>
                              {keyIdx < formattedKeys.length - 1 && (
                                <span className="text-faint" aria-hidden="true">
                                  +
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4 text-label-sm text-faint">
          <span>{isMac ? "Mac layout" : "Windows/Linux layout"}</span>
          <span>{totalMatches} actions</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
