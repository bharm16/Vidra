import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionsPanel } from "@components/ToolSidebar/components/panels/SessionsPanel";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";

vi.mock("@utils/cn", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@components/Toast", () => ({
  useToast: () => toastMocks,
}));

vi.mock("@components/EmptyState", () => ({
  HistoryEmptyState: ({ onCreateNew }: { onCreateNew: () => void }) => (
    <button type="button" onClick={onCreateNew}>
      Empty Create
    </button>
  ),
}));

vi.mock("@features/history/components/HistoryItem", () => ({
  HistoryItem: ({
    entry,
    onLoad,
    onCopyPrompt,
    onOpenInNewTab,
    onRename,
    dataIndex,
    title,
  }: {
    entry: PromptHistoryEntry;
    onLoad: (entry: PromptHistoryEntry) => void;
    onCopyPrompt: (entry: PromptHistoryEntry) => void;
    onOpenInNewTab: (entry: PromptHistoryEntry) => void;
    onRename?: (entry: PromptHistoryEntry) => void;
    dataIndex?: number;
    title: string;
  }) => (
    <li data-testid="history-item" data-history-index={dataIndex ?? 0}>
      <span>{title}</span>
      <button type="button" onClick={() => onLoad(entry)}>
        Load
      </button>
      <button type="button" onClick={() => onCopyPrompt(entry)}>
        Copy
      </button>
      <button type="button" onClick={() => onOpenInNewTab(entry)}>
        Open
      </button>
      {onRename ? (
        <button type="button" onClick={() => onRename(entry)}>
          Rename
        </button>
      ) : null}
    </li>
  ),
}));

vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@promptstudio/system/components/ui/input", () => ({
  Input: React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
  >((props, ref) => <input ref={ref} {...props} />),
}));

vi.mock("@promptstudio/system/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@promptstudio/system/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const createEntry = (
  overrides: Partial<PromptHistoryEntry> = {},
): PromptHistoryEntry => ({
  id: overrides.id ?? "entry-1",
  uuid: overrides.uuid ?? "uuid-1",
  timestamp: overrides.timestamp ?? "2024-01-10T00:00:00Z",
  input: overrides.input ?? "Input prompt",
  output: overrides.output ?? "Output prompt",
  title: overrides.title ?? null,
  versions: overrides.versions ?? [],
  targetModel: overrides.targetModel ?? null,
});

describe("SessionsPanel", () => {
  const onSearchChange = vi.fn();
  const onLoadFromHistory = vi.fn();
  const onCreateNew = vi.fn();
  const onDelete = vi.fn();
  const onRename = vi.fn();

  beforeEach(() => {
    toastMocks.success.mockClear();
    toastMocks.error.mockClear();
    toastMocks.warning.mockClear();
    toastMocks.info.mockClear();
    onSearchChange.mockClear();
    onLoadFromHistory.mockClear();
    onCreateNew.mockClear();
    onDelete.mockClear();
    onRename.mockClear();
  });

  describe("error handling", () => {
    it("warns when trying to copy an empty prompt", async () => {
      const entry = createEntry({ input: "   ", output: "   " });

      render(
        <SessionsPanel
          history={[entry]}
          filteredHistory={[entry]}
          isLoading={false}
          searchQuery=""
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Copy" }));

      expect(toastMocks.warning).toHaveBeenCalledWith("Nothing to copy yet.");
    });

    it("warns when clipboard is unavailable", async () => {
      const user = userEvent.setup();
      const entry = createEntry({ output: "Some output" });
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
      });

      render(
        <SessionsPanel
          history={[entry]}
          filteredHistory={[entry]}
          isLoading={false}
          searchQuery=""
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Copy" }));

      expect(toastMocks.error).toHaveBeenCalledWith("Clipboard unavailable.");

      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    });

    it("blocks empty rename submissions with a warning", async () => {
      const entry = createEntry({ input: "My prompt" });

      render(
        <SessionsPanel
          history={[entry]}
          filteredHistory={[entry]}
          isLoading={false}
          searchQuery=""
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
          onRename={onRename}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Rename" }));

      const input = screen.getByPlaceholderText("Prompt title");
      fireEvent.change(input, { target: { value: "   " } });

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(toastMocks.warning).toHaveBeenCalledWith("Title cannot be empty.");
      expect(onRename).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("shows no results message for search queries with empty history", () => {
      render(
        <SessionsPanel
          history={[]}
          filteredHistory={[]}
          isLoading={false}
          searchQuery="cats"
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
        />,
      );

      expect(screen.getByText('No results for "cats".')).toBeInTheDocument();
    });

    it("shows filter empty state when filters eliminate all entries", async () => {
      const user = userEvent.setup();
      const entry = createEntry({
        id: "entry-old",
        timestamp: "2023-12-01T00:00:00Z",
      });

      render(
        <SessionsPanel
          history={[entry]}
          filteredHistory={[entry]}
          isLoading={false}
          searchQuery=""
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Videos only" }));

      expect(
        screen.getByText("No prompts match these filters."),
      ).toBeInTheDocument();
    });
  });

  describe("core behavior", () => {
    it("renders the unified panel header — icon title and New action, no back arrow", async () => {
      const user = userEvent.setup();
      const entries = [createEntry()];

      render(
        <SessionsPanel
          history={entries}
          filteredHistory={entries}
          isLoading={false}
          searchQuery=""
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
        />,
      );

      expect(
        screen.getByRole("heading", { level: 2, name: "Sessions" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();

      await user.click(screen.getByRole("button", { name: /New/ }));
      expect(onCreateNew).toHaveBeenCalledTimes(1);
    });

    it("shows more history entries when toggled", async () => {
      const user = userEvent.setup();
      const entries = Array.from({ length: 6 }).map((_, index) =>
        createEntry({ id: `entry-${index}`, uuid: `uuid-${index}` }),
      );

      render(
        <SessionsPanel
          history={entries}
          filteredHistory={entries}
          isLoading={false}
          searchQuery=""
          onSearchChange={onSearchChange}
          onLoadFromHistory={onLoadFromHistory}
          onCreateNew={onCreateNew}
          onDelete={onDelete}
        />,
      );

      expect(screen.getAllByTestId("history-item")).toHaveLength(5);

      await user.click(screen.getByRole("button", { name: "See more..." }));

      expect(screen.getAllByTestId("history-item")).toHaveLength(6);
    });
  });
});
