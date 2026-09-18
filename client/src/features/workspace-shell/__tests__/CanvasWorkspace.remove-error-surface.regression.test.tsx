import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression (issue #113): a Remove that fails tells the creator and leaves the
 * node.
 *
 * 1. Failure boundary: CanvasWorkspace's `handleRemoveSpaceNode` — the space
 *    node's Remove action, which used to swallow archive failures while the
 *    neighbouring share and studio actions reported theirs.
 * 2. Mock boundary: the client wire (`features/space/api/spaceApi`) and the
 *    toast surface; the real SpaceNodeMenu renders through a stubbed TheSpace.
 * 3. Invariant: a rejected archive surfaces an error toast and the node stays
 *    (its optimistic-archived flag is never set); a resolved archive hides the
 *    node and raises no error.
 */

const dataState: { hasExpandedPrompt: boolean } = { hasExpandedPrompt: true };

const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

vi.mock("@components/Toast", () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/space/api/spaceApi", () => ({
  archiveGeneration: vi.fn(),
}));

// Stub the canvas surface so the real SpaceNodeMenu (and the real remove
// handler behind it) render without the viewport's geometry. Each node also
// reports its archived flag, which is how "the node stays" is observed.
vi.mock("@/components/canvas/CanvasViewport", () => ({
  CanvasViewport: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/features/space/components/TheSpace", () => ({
  TheSpace: ({
    nodes,
    renderNodeMenu,
  }: {
    nodes: Array<{ id: string; archived?: boolean }>;
    renderNodeMenu?: (node: { id: string }) => React.ReactNode;
  }) => (
    <div data-testid="the-space">
      {nodes.map((node) => (
        <div key={node.id}>
          <span
            data-testid={`node-archived-${node.id}`}
            data-archived={String(Boolean(node.archived))}
          />
          {renderNodeMenu?.(node)}
        </div>
      ))}
    </div>
  ),
}));

vi.mock(
  "@/features/prompt-optimizer/context/PromptResultsActionsContext",
  () => ({
    usePromptResultsData: () => ({
      suggestionsData: null,
      i2vContext: null,
      ideaBoxStage: { kind: "idle" },
      isExpanding: false,
      hasExpandedPrompt: dataState.hasExpandedPrompt,
    }),
    usePromptResultsActions: () => ({
      user: null,
      onDisplayedPromptChange: () => {},
      onReoptimize: async () => {},
      onFetchSuggestions: () => {},
      onSuggestionClick: () => {},
      onHighlightsPersist: () => {},
      onUndo: () => {},
      onRedo: () => {},
      stablePromptContext: null,
      onIdeaBoxRegenerate: vi.fn(),
    }),
  }),
);

import type {
  Generation,
  GenerationsPanelProps,
} from "@features/generations/types";

vi.mock("@features/generation-controls", () => ({
  useGenerationControlsStoreActions: () => ({
    setSelectedModel: vi.fn(),
    setVideoTier: vi.fn(),
    setCameraMotion: vi.fn(),
    setStartFrame: vi.fn(),
  }),
  useGenerationControlsStoreState: () => ({
    domain: {
      generationParams: { duration_s: 5 },
      startFrame: null,
      selectedModel: "sora-2",
      videoTier: "render",
      cameraMotion: null,
    },
  }),
}));

vi.mock("@/features/prompt-optimizer/context/PromptStateContext", () => ({
  useOptionalPromptHighlights: () => null,
  useOptionalPromptServices: () => null,
}));

vi.mock("@/features/prompt-optimizer/context/WorkspaceSessionContext", () => ({
  useWorkspaceSession: () => ({
    session: { id: "session-1", prompt: { input: "a cat", output: "a cat" } },
    hasActiveContinuityShot: false,
    currentShot: null,
    updateShot: vi.fn(),
  }),
}));

vi.mock("@features/generations", () => ({
  useGenerationsRuntime: () => ({
    heroGeneration: null,
    generations: [],
    handleCancel: vi.fn(),
    handleRetry: vi.fn(),
    handleDownload: vi.fn(),
  }),
}));

vi.mock("@/components/ToolSidebar/context", () => ({
  useSidebarGenerationDomain: () => null,
}));

vi.mock("../hooks/useModelSelectionRecommendation", () => ({
  useModelSelectionRecommendation: () => ({
    recommendationMode: "t2v",
    modelRecommendation: null,
    recommendedModelId: undefined,
    efficientModelId: undefined,
    renderModelOptions: [{ id: "sora-2", label: "Sora" }],
    renderModelId: "sora-2",
    recommendationAgeMs: null,
  }),
}));

vi.mock("../components/WorkspaceTopBar", () => ({
  WorkspaceTopBar: () => <header role="banner">topbar</header>,
}));
vi.mock("@/components/navigation/NavRail", () => ({ NavRail: () => null }));

vi.mock("../components/CanvasSettingsRow", () => ({
  CanvasSettingsRow: () => <div data-testid="canvas-settings-row" />,
}));

vi.mock("@/features/prompt-optimizer/components/GenerationPopover", () => ({
  GenerationPopover: () => null,
}));

vi.mock("@/components/modals/CameraMotionModal", () => ({
  CameraMotionModal: () => null,
}));

import { CanvasWorkspace } from "../CanvasWorkspace";
import { buildPromptEditorWiring } from "./__fixtures__/promptEditorWiring";
import { withSelectedSpan } from "@/features/prompt-optimizer/context/__tests__/selectedSpanTestHarness";
import { archiveGeneration } from "@/features/space/api/spaceApi";
import { ApiError } from "@/services/http/ApiError";

const mockedArchive = vi.mocked(archiveGeneration);

// One completed picture take, so the session's space renders a removable leaf
// node (a childless picture) with its action menu.
const PICTURE_TAKE = {
  id: "pic-1",
  mediaType: "image",
  status: "completed",
  prompt: "a cat",
  promptVersionId: "v-1",
  model: "flux-kontext",
  tier: "draft",
  createdAt: 1000,
  mediaUrls: ["https://example.com/pic-1.png"],
};

const buildProps = (): React.ComponentProps<typeof CanvasWorkspace> => ({
  generationsPanelProps: {
    prompt: "a cat",
    promptVersionId: "v-1",
    versions: [
      {
        versionId: "v-1",
        prompt: "a cat",
        timestamp: "2026-01-01T00:00:00.000Z",
        generations: [PICTURE_TAKE],
      },
    ],
  } as unknown as GenerationsPanelProps,
  editing: buildPromptEditorWiring(),
  onReuseGeneration: vi.fn(),
  onToggleGenerationFavorite: vi.fn(),
});

const openRemove = async (): Promise<void> => {
  await userEvent.click(await screen.findByTestId("space-node-menu-pic-1"));
  await userEvent.click(await screen.findByTestId("space-node-remove-pic-1"));
};

describe("regression: a failed Remove is surfaced and the node stays (#113)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataState.hasExpandedPrompt = true;
  });

  it("surfaces the leaf-conflict (409) and leaves the node in place", async () => {
    mockedArchive.mockRejectedValueOnce(
      new ApiError("conflict", 409, {
        success: false,
        error: "Only a childless node can be removed",
      }),
    );

    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));
    await openRemove();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Only a childless node can be removed",
      ),
    );
    expect(screen.getByTestId("node-archived-pic-1")).toHaveAttribute(
      "data-archived",
      "false",
    );
  });

  it("surfaces a generic failure and leaves the node in place", async () => {
    mockedArchive.mockRejectedValueOnce(new Error("network down"));

    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));
    await openRemove();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't remove this node"),
    );
    expect(screen.getByTestId("node-archived-pic-1")).toHaveAttribute(
      "data-archived",
      "false",
    );
  });

  it("hides the node and raises no error when the archive succeeds", async () => {
    mockedArchive.mockResolvedValueOnce(undefined);

    render(withSelectedSpan(<CanvasWorkspace {...buildProps()} />));
    await openRemove();

    await waitFor(() =>
      expect(screen.getByTestId("node-archived-pic-1")).toHaveAttribute(
        "data-archived",
        "true",
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});
