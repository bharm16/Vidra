import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GenerationCard } from "@features/generations/components/GenerationCard";
import type { Generation } from "@features/generations/types";

const mockUseGenerationProgress = vi.fn();

vi.mock("@features/generations/hooks/useGenerationProgress", () => ({
  useGenerationProgress: (generation: Generation) =>
    mockUseGenerationProgress(generation),
}));

const mockKontextFrameStrip = vi.fn();
const mockVideoThumbnail = vi.fn();

vi.mock("@features/generations/components/KontextFrameStrip", () => ({
  KontextFrameStrip: (props: {
    onFrameClick?: (index: number, url: string | null) => void;
  }) => {
    mockKontextFrameStrip(props);
    return (
      <button
        type="button"
        onClick={() => props.onFrameClick?.(1, "https://cdn/frame.png")}
      >
        Frame
      </button>
    );
  },
}));

vi.mock("@features/generations/components/VideoThumbnail", () => ({
  VideoThumbnail: (props: { isGenerating: boolean }) => {
    mockVideoThumbnail(props);
    return <div>VideoThumbnail</div>;
  },
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, CONTINUITY_UI: true },
  };
});

const createGeneration = (overrides: Partial<Generation> = {}): Generation => ({
  id: "gen-1",
  tier: "draft",
  status: "pending",
  model: "wan-2.2",
  prompt: "Prompt",
  promptVersionId: "version-1",
  createdAt: 1,
  completedAt: null,
  mediaType: "image-sequence",
  mediaUrls: ["https://cdn/frame.png"],
  thumbnailUrl: null,
  error: null,
  ...overrides,
});

describe("GenerationCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGenerationProgress.mockReturnValue({
      progressPercent: null,
      isGenerating: false,
      isCompleted: false,
      isFailed: false,
    });
  });

  describe("error handling", () => {
    it("shows the failure state and allows retrying", async () => {
      mockUseGenerationProgress.mockReturnValue({
        progressPercent: null,
        isGenerating: false,
        isCompleted: false,
        isFailed: true,
      });
      const onRetry = vi.fn();
      const generation = createGeneration({
        status: "failed",
        error: "Generation failed",
      });

      const user = userEvent.setup();
      render(<GenerationCard generation={generation} onRetry={onRetry} />);

      expect(screen.getByText("Generation failed")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledWith(generation);
    });
  });

  describe("edge cases", () => {
    it("ignores card click when clicking an interactive child button", () => {
      const onClick = vi.fn();
      const onSelectFrame = vi.fn();
      const generation = createGeneration({ status: "completed" });

      render(
        <GenerationCard
          generation={generation}
          onClick={onClick}
          onSelectFrame={onSelectFrame}
          selectedFrameUrl={null}
        />,
      );

      const frameButton = screen
        .getAllByRole("button", { name: /frame/i })
        .find((element) => element.tagName === "BUTTON");
      expect(frameButton).toBeDefined();
      if (!frameButton) return;

      fireEvent.click(frameButton);

      expect(onSelectFrame).toHaveBeenCalledWith(
        "https://cdn/frame.png",
        1,
        "gen-1",
      );
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("core behavior", () => {
    it("passes selected frames to the parent callback", () => {
      const onSelectFrame = vi.fn();
      const generation = createGeneration({ status: "completed" });

      render(
        <GenerationCard
          generation={generation}
          onSelectFrame={onSelectFrame}
          selectedFrameUrl={null}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /frame/i }));
      expect(onSelectFrame).toHaveBeenCalledWith(
        "https://cdn/frame.png",
        1,
        "gen-1",
      );
    });

    it("keeps continue-as-sequence enabled when asset id exists but URL is a signed storage URL", async () => {
      const onContinueSequence = vi.fn();
      const generation = createGeneration({
        mediaType: "video",
        status: "completed",
        mediaUrls: [
          "https://storage.googleapis.com/example-bucket/users%2Fuser-1%2Fgeneration%2Fvideo.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc",
        ],
        mediaAssetIds: ["video-asset-123"],
      });

      const user = userEvent.setup();
      render(
        <GenerationCard
          generation={generation}
          onContinueSequence={onContinueSequence}
        />,
      );

      const button = screen.getByRole("button", {
        name: /continue as sequence/i,
      });
      expect(button).toBeEnabled();
      await user.click(button);
      expect(onContinueSequence).toHaveBeenCalledWith(generation);
    });

    it("keeps continue-as-sequence enabled when only storage path exists", async () => {
      const onContinueSequence = vi.fn();
      const generation = createGeneration({
        mediaType: "video",
        status: "completed",
        mediaUrls: [
          "https://storage.googleapis.com/example-bucket/users%2Fuser-1%2Fgeneration%2Fvideo.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc",
        ],
        mediaAssetIds: ["users/user-1/generations/video.mp4"],
      });

      const user = userEvent.setup();
      render(
        <GenerationCard
          generation={generation}
          onContinueSequence={onContinueSequence}
        />,
      );

      const button = screen.getByRole("button", {
        name: /continue as sequence/i,
      });
      expect(button).toBeEnabled();
      await user.click(button);
      expect(onContinueSequence).toHaveBeenCalledWith(generation);
    });
  });
});
