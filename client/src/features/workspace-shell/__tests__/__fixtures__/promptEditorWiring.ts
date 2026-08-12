import React from "react";
import { vi } from "vitest";
import type { PromptEditorWiring } from "@features/workspace-shell/components/PromptEditorSurface";

/**
 * A prompt-editing surface wired to spies.
 *
 * Every CanvasWorkspace regression test needs the whole cluster to mount the
 * component and cares about at most one field of it. Each used to spell all 18
 * out in its own `buildProps`, so adding a handler meant editing ten test files
 * that had no opinion about it.
 */
export const buildPromptEditorWiring = (
  overrides: Partial<PromptEditorWiring> = {},
): PromptEditorWiring => ({
  editorRef: React.createRef<HTMLDivElement>(),
  onTextSelection: vi.fn(),
  onHighlightClick: vi.fn(),
  onHighlightMouseDown: vi.fn(),
  onHighlightMouseEnter: vi.fn(),
  onHighlightMouseLeave: vi.fn(),
  onCopyEvent: vi.fn(),
  onInput: vi.fn(),
  onEditorKeyDown: vi.fn(),
  onEditorBlur: vi.fn(),
  autocompleteOpen: false,
  autocompleteSuggestions: [],
  autocompleteSelectedIndex: 0,
  autocompletePosition: { top: 0, left: 0 },
  autocompleteLoading: false,
  onAutocompleteSelect: vi.fn(),
  onAutocompleteClose: vi.fn(),
  onAutocompleteIndexChange: vi.fn(),
  ...overrides,
});
