import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SidebarDataContextProvider,
  type SidebarDataContextValue,
} from "@/components/ToolSidebar/context";
import type { ToolSidebarSessionsDomain } from "@/components/ToolSidebar/types";
import { useWorkspaceProject } from "../useWorkspaceProject";

const buildSessionsDomain = (
  overrides: Partial<ToolSidebarSessionsDomain>,
): ToolSidebarSessionsDomain => ({
  history: [],
  filteredHistory: [],
  isLoadingHistory: false,
  searchQuery: "",
  onSearchChange: () => {},
  onLoadFromHistory: () => {},
  onCreateNew: () => {},
  onDelete: () => {},
  ...overrides,
});

const buildWrapper = (
  sessions: ToolSidebarSessionsDomain | null,
): (({ children }: { children: ReactNode }) => React.ReactElement) => {
  const value: SidebarDataContextValue = {
    sessions,
    promptInteraction: null,
    generation: null,
    assets: null,
  };
  return function Wrapper({
    children,
  }: {
    children: ReactNode;
  }): React.ReactElement {
    return (
      <SidebarDataContextProvider value={value}>
        {children}
      </SidebarDataContextProvider>
    );
  };
};

describe("useWorkspaceProject", () => {
  it("falls back to Untitled when no sessions domain is mounted", () => {
    const { result } = renderHook(() => useWorkspaceProject());
    expect(result.current.name).toBe("Untitled");
  });

  it("derives the name from the current session's prompt input", () => {
    const wrapper = buildWrapper(
      buildSessionsDomain({
        history: [
          {
            uuid: "uuid-1",
            input: "a cozy coffee shop on a rainy afternoon, warm window light",
            output: "",
          },
        ],
        currentPromptUuid: "uuid-1",
      }),
    );
    const { result } = renderHook(() => useWorkspaceProject(), { wrapper });
    expect(result.current.name).toBe("Cozy Coffee Shop On A Rainy");
  });

  it("prefers a stored session title over the derived one", () => {
    const wrapper = buildWrapper(
      buildSessionsDomain({
        history: [
          {
            id: "doc-1",
            title: "Beach Sunset Spec",
            input: "a cozy coffee shop on a rainy afternoon",
            output: "",
          },
        ],
        currentPromptDocId: "doc-1",
      }),
    );
    const { result } = renderHook(() => useWorkspaceProject(), { wrapper });
    expect(result.current.name).toBe("Beach Sunset Spec");
  });

  it("matches the current entry by doc id when uuid is absent", () => {
    const wrapper = buildWrapper(
      buildSessionsDomain({
        history: [
          { id: "doc-a", input: "astronaut on mars at dawn", output: "" },
          { id: "doc-b", input: "underwater neon jellyfish", output: "" },
        ],
        currentPromptDocId: "doc-b",
      }),
    );
    const { result } = renderHook(() => useWorkspaceProject(), { wrapper });
    expect(result.current.name).toBe("Underwater Neon Jellyfish");
  });

  it("falls back to Untitled when no history entry matches the current session", () => {
    const wrapper = buildWrapper(
      buildSessionsDomain({
        history: [{ uuid: "uuid-1", input: "astronaut on mars", output: "" }],
        currentPromptUuid: "uuid-other",
      }),
    );
    const { result } = renderHook(() => useWorkspaceProject(), { wrapper });
    expect(result.current.name).toBe("Untitled");
  });

  it("falls back to Untitled when the current entry has no usable text", () => {
    const wrapper = buildWrapper(
      buildSessionsDomain({
        history: [{ uuid: "uuid-1", input: "   ", output: "" }],
        currentPromptUuid: "uuid-1",
      }),
    );
    const { result } = renderHook(() => useWorkspaceProject(), { wrapper });
    expect(result.current.name).toBe("Untitled");
  });
});
