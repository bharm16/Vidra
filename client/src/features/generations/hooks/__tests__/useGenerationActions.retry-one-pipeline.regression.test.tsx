import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { clearVideoInputSupportCache } from "@features/generations/utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";
import type { Generation } from "@features/generations/types";

/**
 * Regression: retrying a take re-runs the one pipeline, whatever its tier.
 *
 * `retryGeneration` used to branch on `generation.tier` to pick between
 * `generateDraft` and `generateRender` — two ~400-line copies of the same run.
 * The tier is now data passed into `runVideoGeneration`; these tests pin that
 * every kind of take still re-runs correctly through it: a draft compiles the
 * WAN prompt first, a render dispatches the words as-is, and a flux-kontext
 * draft re-enters its storyboard branch.
 */
const compileWanPromptMock = vi.fn();
const generateVideoPreviewMock = vi.fn();
const generateStoryboardPreviewMock = vi.fn();
const waitForVideoJobMock = vi.fn();
const getCapabilitiesMock = vi.fn();

vi.mock("@/services", () => ({
  capabilitiesApi: {
    getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
  },
}));

vi.mock("@/hooks/useUserCreditBalance", () => ({
  publishCreditBalanceSync: vi.fn(),
  requestCreditBalanceRefresh: vi.fn(),
}));

vi.mock("../../api", () => ({
  compileWanPrompt: (...args: unknown[]) => compileWanPromptMock(...args),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
  generateStoryboardPreview: (...args: unknown[]) =>
    generateStoryboardPreviewMock(...args),
  waitForVideoJob: (...args: unknown[]) => waitForVideoJobMock(...args),
}));

const makeTake = (overrides: Partial<Generation>): Generation => ({
  id: "take-1",
  tier: "render",
  status: "failed",
  model: "sora-2",
  prompt: "a dancer in the rain",
  promptVersionId: "v-1",
  createdAt: 1,
  completedAt: null,
  mediaType: "video",
  mediaUrls: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  clearVideoInputSupportCache();
  getCapabilitiesMock.mockResolvedValue({
    provider: "generic",
    model: "wan-2.2",
    version: "1",
    fields: {},
  });
  compileWanPromptMock.mockResolvedValue("compiled prompt");
  generateVideoPreviewMock.mockResolvedValue({
    success: true,
    videoUrl: "https://storage.example.com/clip.mp4",
  });
  generateStoryboardPreviewMock.mockResolvedValue({
    success: true,
    data: {
      imageUrls: ["https://storage.example.com/frame.webp"],
      baseImageUrl: "https://storage.example.com/frame.webp",
    },
  });
});

describe("regression: retry re-runs the one pipeline for every tier", () => {
  it("re-runs a render take without compiling the WAN prompt", async () => {
    const take = makeTake({ tier: "render", model: "sora-2" });
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), { generations: [take] }),
    );

    act(() => {
      result.current.retryGeneration("take-1");
    });

    await waitFor(() => expect(generateVideoPreviewMock).toHaveBeenCalled());
    const [prompt, , model] = generateVideoPreviewMock.mock.calls[0] as [
      string,
      string | undefined,
      string,
    ];
    expect(prompt).toBe("a dancer in the rain");
    expect(model).toBe("sora-2");
    expect(compileWanPromptMock).not.toHaveBeenCalled();
  });

  it("re-runs a draft take through WAN prompt compilation", async () => {
    const take = makeTake({ tier: "draft", model: "wan-2.2" });
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), { generations: [take] }),
    );

    act(() => {
      result.current.retryGeneration("take-1");
    });

    await waitFor(() => expect(generateVideoPreviewMock).toHaveBeenCalled());
    expect(compileWanPromptMock).toHaveBeenCalledWith(
      "a dancer in the rain",
      expect.anything(),
    );
    const [prompt] = generateVideoPreviewMock.mock.calls[0] as [string];
    expect(prompt).toBe("compiled prompt");
  });

  it("re-enters the storyboard branch for a flux-kontext draft", async () => {
    const take = makeTake({
      tier: "draft",
      model: "flux-kontext",
      mediaType: "image-sequence",
    });
    const { result } = renderHook(() =>
      useGenerationActions(vi.fn(), { generations: [take] }),
    );

    act(() => {
      result.current.retryGeneration("take-1");
    });

    await waitFor(() =>
      expect(generateStoryboardPreviewMock).toHaveBeenCalled(),
    );
    expect(generateVideoPreviewMock).not.toHaveBeenCalled();
  });
});
