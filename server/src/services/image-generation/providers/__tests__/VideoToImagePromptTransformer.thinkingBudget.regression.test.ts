/**
 * Regression: the video→image transformer handed Flux subject-less fragments
 * ("medium shot, low angle (worm's-eye view), 50mm lens, A, , features a
 * magnificent"), producing first frames with the wrong subject entirely (a
 * golden-retriever idea rendered a millipede). Root cause: the transformer
 * calls the Gemini client directly with maxTokens 500 and no thinkingConfig;
 * Gemini 2.5 thinking tokens count against maxOutputTokens, so thinking
 * consumed the budget and the transformed prompt truncated before the subject.
 *
 * Invariant: for any video→image prompt transformation — the initial pass AND
 * the camera-cue repair pass — the LLM request reserves the full output budget
 * for response text (thinking budget pinned to 0).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { VideoToImagePromptTransformer } from "../VideoToImagePromptTransformer";
import { LLMClient } from "@clients/LLMClient";
import type { AIResponse } from "@interfaces/IAIClient";

const buildResponse = (text: string): AIResponse => ({
  text,
  metadata: {},
});

const createClient = () => {
  const completeMock: MockedFunction<
    (
      systemPrompt: string,
      options?: Record<string, unknown>,
    ) => Promise<AIResponse>
  > = vi.fn();

  const adapter = {
    complete: completeMock,
  };

  const client = new LLMClient({
    adapter,
    providerName: "test-llm",
    defaultTimeout: 1000,
  });

  return { client, completeMock };
};

// The dry-run paragraph that produced the millipede frame.
const VIDEO_PROMPT =
  "A medium long, low-angle dolly tracking shot, captured on a 50mm lens, " +
  "follows a magnificent golden retriever with a shiny golden coat leaping " +
  "mid-air to catch a blue frisbee in a sun-drenched park.";

const CUE_RICH_RESULT =
  "medium long shot, low angle, 50mm lens, golden retriever leaping mid-air " +
  "to catch a blue frisbee, sun-drenched park, warm sunlight";

const CUE_LESS_RESULT =
  "a happy dog playing with a toy outdoors on a bright day in the grass";

describe("regression: video->image transformation reserves its token budget for output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("every transformation request pins the thinking budget to 0", async () => {
    const { client, completeMock } = createClient();
    completeMock.mockResolvedValue(buildResponse(CUE_RICH_RESULT));

    const transformer = new VideoToImagePromptTransformer({
      llmClient: client,
    });
    await transformer.transform(VIDEO_PROMPT);

    expect(completeMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of completeMock.mock.calls) {
      expect(call[1]?.thinkingBudget).toBe(0);
    }
  });

  it("the camera-cue repair pass also pins the thinking budget to 0", async () => {
    const { client, completeMock } = createClient();
    completeMock
      .mockResolvedValueOnce(buildResponse(CUE_LESS_RESULT))
      .mockResolvedValue(buildResponse(CUE_RICH_RESULT));

    const transformer = new VideoToImagePromptTransformer({
      llmClient: client,
    });
    await transformer.transform(VIDEO_PROMPT);

    expect(completeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of completeMock.mock.calls) {
      expect(call[1]?.thinkingBudget).toBe(0);
    }
  });
});
