import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearVideoInputSupportCache } from "@features/generations/utils/videoInputSupport";
import { useGenerationActions } from "../useGenerationActions";

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), generate: vi.fn() }));
vi.mock("@/services", () => ({
  capabilitiesApi: { getCapabilities: mocks.capabilities },
}));
vi.mock("../../api", () => ({
  generateVideoPreview: mocks.generate,
  compileWanPrompt: vi.fn(),
  generateStoryboardPreview: vi.fn(),
  waitForVideoJob: vi.fn(),
}));
vi.mock("@/hooks/useUserCreditBalance", () => ({
  publishCreditBalanceSync: vi.fn(),
  requestCreditBalanceRefresh: vi.fn(),
}));

const schema = {
  provider: "generic",
  model: "google/veo-3",
  version: "1",
  fields: {},
};

describe("generation prepared for a newly created words version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVideoInputSupportCache();
    mocks.generate.mockResolvedValue({
      success: true,
      videoUrl: "https://example.com/clip.mp4",
    });
  });

  it.each(["same-target", "other-version", "other-session"])(
    "continues only for its original destination: %s",
    async (transition) => {
      let finishCapabilities: ((value: typeof schema) => void) | undefined;
      mocks.capabilities.mockImplementation(
        () =>
          new Promise<typeof schema>((resolve) => {
            finishCapabilities = resolve;
          }),
      );
      const { result, rerender } = renderHook(
        ({ version, session }) =>
          useGenerationActions(vi.fn(), {
            promptVersionId: version,
            sessionId: session,
            generations: [],
          }),
        { initialProps: { version: "v-old", session: "session-1" } },
      );
      let run: Promise<unknown> | undefined;
      act(() => {
        run = result.current.generateRender(
          "google/veo-3",
          "The camera pushes in.",
          { promptVersionId: "v-new" },
        );
      });
      rerender({
        version: transition === "other-version" ? "v-other" : "v-new",
        session: transition === "other-session" ? "session-2" : "session-1",
      });
      await act(async () => {
        finishCapabilities?.(schema);
        await run;
      });
      if (transition === "same-target") {
        expect(mocks.generate).toHaveBeenCalledOnce();
        expect(mocks.generate.mock.calls[0]?.[3]).toMatchObject({
          sessionId: "session-1",
          promptVersionId: "v-new",
        });
      } else expect(mocks.generate).not.toHaveBeenCalled();
      expect(result.current.isSubmitting).toBe(false);
    },
  );
});
