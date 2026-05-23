import { describe, expect, it, vi } from "vitest";
import { VideoPromptCompilationService } from "@services/prompt-optimization/services/VideoPromptCompilationService";
import { VideoPromptService } from "@services/video-prompt-analysis/VideoPromptService";
import {
  BaseStrategy,
  StrategyRegistry,
  type AugmentResult,
  type NormalizeResult,
  type PromptContext,
  type PromptOptimizationResult,
  type TransformResult,
  type VideoPromptIR,
} from "@services/video-prompt-analysis/strategies";
import { VideoPromptAnalyzer } from "@services/video-prompt-analysis/services/analysis/VideoPromptAnalyzer";
import { VideoPromptLLMRewriter } from "@services/video-prompt-analysis/services/rewriter/VideoPromptLLMRewriter";
import type { StructuredOptimizationArtifact } from "@services/prompt-optimization/types";
import type { VideoPromptStructuredResponse } from "@services/prompt-optimization/strategies/videoPromptTypes";

class TrackingAnalyzer extends VideoPromptAnalyzer {
  readonly analyzeSpy = vi.fn(
    async (text: string): Promise<VideoPromptIR> => ({
      subjects: [{ text: "flattened subject", attributes: [] }],
      actions: ["generic motion"],
      camera: { movements: [] },
      environment: { setting: "", lighting: [] },
      audio: {},
      meta: { mood: [], style: [] },
      technical: {},
      raw: text,
    }),
  );

  override analyze(text: string): Promise<VideoPromptIR> {
    return this.analyzeSpy(text);
  }
}

class TrackingRewriter extends VideoPromptLLMRewriter {
  constructor() {
    super(null);
  }

  override async rewrite(ir: VideoPromptIR): Promise<string> {
    return [
      `subject:${ir.subjects[0]?.text ?? "missing-subject"}`,
      `action:${ir.actions[0] ?? "missing-action"}`,
      `raw:${ir.raw}`,
    ].join(" | ");
  }
}

class ArtifactAwareStrategy extends BaseStrategy {
  readonly modelId = "wan-2.2";
  readonly modelName = "Wan 2.2";

  getModelConstraints() {
    return {
      wordLimits: { min: 1, max: 80 },
      triggerBudgetWords: 10,
    };
  }

  protected async doValidate(
    _input: string,
    _context?: PromptContext,
  ): Promise<void> {}

  protected doNormalize(input: string): NormalizeResult {
    return { text: input, changes: [], strippedTokens: [] };
  }

  protected doTransform(
    llmPrompt: string | Record<string, unknown>,
    _ir: VideoPromptIR,
  ): TransformResult {
    return {
      prompt:
        typeof llmPrompt === "string" ? llmPrompt : JSON.stringify(llmPrompt),
      changes: ["Rendered regression prompt"],
    };
  }

  protected doAugment(result: PromptOptimizationResult): AugmentResult {
    return {
      prompt: result.prompt,
      changes: [],
      triggersInjected: [],
    };
  }
}

function createStructuredPrompt(
  overrides: Partial<VideoPromptStructuredResponse> = {},
): VideoPromptStructuredResponse {
  return {
    _creative_strategy: "regression test",
    shot_framing: "close-up",
    camera_angle: "eye level",
    camera_move: "static tripod",
    camera_lens: null,
    subject: "baby",
    subject_details: ["round cheeks"],
    action: "driving a tiny toy car",
    setting: "inside a parked family sedan",
    time: "daytime",
    lighting: "soft window light",
    style: "home video realism",
    technical_specs: {
      aspect_ratio: "16:9",
    },
    ...overrides,
  };
}

function createArtifact(
  overrides: Partial<StructuredOptimizationArtifact> = {},
): StructuredOptimizationArtifact {
  return {
    sourcePrompt: 'baby says "go" while pretending to drive a toy car',
    structuredPrompt: createStructuredPrompt(),
    previewPrompt: "baby in toy car",
    aspectRatio: "16:9",
    fallbackUsed: false,
    lintPassed: true,
    ...overrides,
  };
}

function createCompilationService(
  analyzer: TrackingAnalyzer,
  artifact: StructuredOptimizationArtifact | null,
): VideoPromptCompilationService {
  const registry = new StrategyRegistry();
  registry.register(
    "wan-2.2",
    () =>
      new ArtifactAwareStrategy({
        analyzer,
        llmRewriter: new TrackingRewriter(),
      }),
  );

  const videoPromptService = new VideoPromptService({
    strategyRegistry: registry,
  });
  return new VideoPromptCompilationService(videoPromptService, {
    getStructuredArtifact: vi.fn(async () => artifact),
  });
}

describe("regression: compile hot path reuses structured artifacts", () => {
  it("trusted cached artifacts bypass re-analysis and preserve structured subject/action detail", async () => {
    const analyzer = new TrackingAnalyzer();
    const service = createCompilationService(analyzer, createArtifact());

    const result = await service.compilePrompt(
      "Baby driving a car. The camera uses static tripod at eye level.",
      "wan",
      { artifactKey: "artifact-key" },
    );

    expect(analyzer.analyzeSpy).not.toHaveBeenCalled();
    expect(result.compiledPrompt).toContain("subject:baby");
    expect(result.compiledPrompt).toContain("action:driving a tiny toy car");
    expect(result.compiledPrompt).toContain(
      'raw:baby says "go" while pretending to drive a toy car',
    );
    expect(result.compiledPrompt).not.toContain("flattened subject");
    expect(result.metadata).toMatchObject({
      compiledFor: "wan-2.2",
      structuredArtifactReused: true,
    });
  });

  it("low-trust artifacts fall back to re-analysis of the original source prompt", async () => {
    const analyzer = new TrackingAnalyzer();
    const service = createCompilationService(
      analyzer,
      createArtifact({
        fallbackUsed: true,
        lintPassed: false,
      }),
    );

    const result = await service.compilePrompt(
      "generic compiled prose that flattened the original prompt",
      "wan-2.2",
      { artifactKey: "artifact-key" },
    );

    expect(analyzer.analyzeSpy).toHaveBeenCalledTimes(1);
    expect(analyzer.analyzeSpy).toHaveBeenCalledWith(
      'baby says "go" while pretending to drive a toy car',
    );
    expect(result.compiledPrompt).toContain("subject:flattened subject");
    expect(result.compiledPrompt).toContain("action:generic motion");
    expect(result.compiledPrompt).toContain(
      'raw:baby says "go" while pretending to drive a toy car',
    );
    expect(result.metadata).toMatchObject({
      structuredArtifactReused: false,
      compilation: expect.objectContaining({
        structuredArtifactReused: false,
        analyzerBypassed: false,
      }),
    });
  });
});
