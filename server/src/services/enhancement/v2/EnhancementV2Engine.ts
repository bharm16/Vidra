import { logger } from "@infrastructure/Logger";
import { StructuredOutputEnforcer } from "@utils/StructuredOutputEnforcer";
import {
  getCustomSuggestionSchema,
  getEnhancementSchema,
} from "../config/schemas.js";
import {
  CUSTOM_POLICY_CATEGORY_ID,
  SlotPolicyRegistry,
} from "./SlotPolicyRegistry.js";
import { EnhancementV2PromptBuilder } from "./EnhancementV2PromptBuilder.js";
import { V2CandidateScorer } from "./V2CandidateScorer.js";
import type { Suggestion } from "../services/types.js";
import type {
  EnhancementV2Dependencies,
  EnhancementV2Execution,
  EnhancementV2RequestContext,
  GuidedGenerationResult,
  SlotPolicy,
  TemplatedPolicyConfig,
} from "./types.js";

export class EnhancementV2Engine {
  private readonly log = logger.child({ service: "EnhancementV2Engine" });
  private readonly registry: SlotPolicyRegistry;
  private readonly promptBuilder = new EnhancementV2PromptBuilder();
  private readonly scorer: V2CandidateScorer;

  constructor(private readonly dependencies: EnhancementV2Dependencies) {
    this.registry = new SlotPolicyRegistry(dependencies.policyVersion);
    this.scorer = new V2CandidateScorer(dependencies.videoPromptService);
  }

  async execute(
    context: EnhancementV2RequestContext,
  ): Promise<EnhancementV2Execution> {
    const policy = context.customRequest
      ? this.registry.resolve(CUSTOM_POLICY_CATEGORY_ID)
      : this.registry.resolve(
          context.highlightedCategory || context.phraseRole,
        );
    const stageCounts: Record<string, number> = {};
    let modelCallCount = 0;

    this.log.debug("Executing V2 enhancement policy", {
      categoryId: policy.categoryId,
      mode: policy.mode,
      highlightedCategory: context.highlightedCategory,
    });

    const primary = await this._generatePrimaryCandidates(policy, context);
    const primaryCandidates = primary.suggestions;
    stageCounts.generatedPrimary = primaryCandidates.length;
    if (policy.mode === "guided_llm") {
      modelCallCount += 1;
    }

    // sceneSummary comes from the primary guided call (rescue overrides
    // only when it actually fires AND emits its own summary).
    let sceneSummary = primary.sceneSummary;

    let evaluations = this.scorer.scoreCandidates(
      primaryCandidates,
      context,
      policy,
    );
    stageCounts.evaluatedPrimary = evaluations.length;
    let rejectionSummary = this.scorer.summarizeRejections(evaluations);
    let finalSuggestions = this._rankAndFilter(
      evaluations,
      context.highlightedText,
      policy.targetCount,
    );
    stageCounts.acceptedPrimary = finalSuggestions.length;

    if (this._shouldRescue(policy, finalSuggestions.length)) {
      const rescue = await this._generateRescueCandidates(
        policy,
        context,
        finalSuggestions,
      );
      const rescueCandidates = rescue.suggestions;
      if (rescueCandidates.length > 0) {
        modelCallCount += 1;
        stageCounts.generatedRescue = rescueCandidates.length;
        if (rescue.sceneSummary) {
          sceneSummary = rescue.sceneSummary;
        }
        const merged = this._dedupeByText([
          ...primaryCandidates,
          ...rescueCandidates,
        ]);
        evaluations = this.scorer.scoreCandidates(merged, context, policy);
        stageCounts.evaluatedRescue = evaluations.length;
        rejectionSummary = this.scorer.summarizeRejections(evaluations);
        finalSuggestions = this._rankAndFilter(
          evaluations,
          context.highlightedText,
          policy.targetCount,
        );
      }
    }

    stageCounts.finalCount = finalSuggestions.length;

    const resultSuggestions = context.isPlaceholder
      ? this._groupSuggestionsByCategory(finalSuggestions)
      : finalSuggestions;

    return {
      result: {
        suggestions: resultSuggestions,
        isPlaceholder: context.isPlaceholder,
        hasCategories:
          context.isPlaceholder &&
          finalSuggestions.some((suggestion) => Boolean(suggestion.category)),
        phraseRole: context.phraseRole,
        appliedConstraintMode: context.videoConstraints?.mode || null,
        fallbackApplied: modelCallCount > 1,
        ...(context.videoConstraints
          ? { appliedVideoConstraints: context.videoConstraints }
          : {}),
        ...(finalSuggestions.length === 0
          ? { noSuggestionsReason: "No V2 suggestions satisfied slot policy." }
          : {}),
      },
      rawSuggestions: primaryCandidates,
      finalSuggestions,
      debug: {
        engineVersion: "v2",
        policyVersion: this.registry.getVersion(),
        categoryId: policy.categoryId,
        mode: policy.mode,
        stageCounts,
        rejectionSummary,
        modelCallCount,
        sceneSummary,
        ...(policy.mode === "guided_llm"
          ? {
              systemPromptSent: this.promptBuilder.buildPrompt(context, policy),
            }
          : {}),
      },
    };
  }

  private async _generatePrimaryCandidates(
    policy: SlotPolicy,
    context: EnhancementV2RequestContext,
  ): Promise<GuidedGenerationResult> {
    if (policy.mode === "enumerated") {
      return {
        suggestions: this._generateEnumeratedCandidates(policy, context),
        sceneSummary: null,
      };
    }

    if (policy.mode === "templated") {
      return {
        suggestions: this._generateTemplatedCandidates(policy, context),
        sceneSummary: null,
      };
    }

    return this._generateGuidedCandidates(
      this.promptBuilder.buildPrompt(context, policy),
      context,
      policy,
    );
  }

  private async _generateRescueCandidates(
    policy: SlotPolicy,
    context: EnhancementV2RequestContext,
    existingSuggestions: Suggestion[],
  ): Promise<GuidedGenerationResult> {
    if (!policy.rescueStrategy?.enabled || policy.rescueStrategy.maxCalls < 1) {
      return { suggestions: [], sceneSummary: null };
    }

    if (policy.mode === "enumerated") {
      return { suggestions: [], sceneSummary: null };
    }

    const missingCount = Math.max(
      policy.minAcceptableCount - existingSuggestions.length,
      1,
    );
    const prompt = this.promptBuilder.buildRescuePrompt(
      context,
      policy,
      existingSuggestions.map((item) => item.text),
      missingCount,
    );

    return this._generateGuidedCandidates(prompt, context, policy);
  }

  private _generateEnumeratedCandidates(
    policy: SlotPolicy,
    context: EnhancementV2RequestContext,
  ): Suggestion[] {
    const highlight = context.highlightedText.trim().toLowerCase();
    return (policy.enumeratedOptions || [])
      .filter((option) => option.text.trim().toLowerCase() !== highlight)
      .map((option) => ({
        text: option.text,
        category: policy.categoryId,
        explanation: `V2 enumerated ${policy.categoryId} alternative`,
      }));
  }

  private _generateTemplatedCandidates(
    policy: SlotPolicy,
    context: EnhancementV2RequestContext,
  ): Suggestion[] {
    const config = policy.templated;
    if (!config) {
      return [];
    }

    const rendered: Suggestion[] = [];
    for (const template of config.templates) {
      const combinations = this._expandTemplate(template.orderedSlots, config);
      for (const combination of combinations) {
        if (this._matchesInvalidCombination(combination, config)) {
          continue;
        }
        const text = this._renderTemplate(combination, config);
        if (
          !text ||
          text.trim().toLowerCase() ===
            context.highlightedText.trim().toLowerCase()
        ) {
          continue;
        }
        rendered.push({
          text,
          category: policy.categoryId,
          explanation: `V2 templated ${policy.categoryId} alternative`,
        });
      }
    }

    return this._dedupeByText(rendered);
  }

  private async _generateGuidedCandidates(
    prompt: string,
    context: EnhancementV2RequestContext,
    policy: SlotPolicy,
  ): Promise<GuidedGenerationResult> {
    const schemaName = policy.suggestionSchemaName ?? "enhancement";
    const operation =
      schemaName === "custom" ? "custom_suggestions" : "enhance_suggestions";
    const operationConfig =
      this.dependencies.aiService.getOperationConfig?.(operation);
    const temperature =
      typeof operationConfig?.temperature === "number"
        ? operationConfig.temperature
        : 0.7;
    const provider = operationConfig?.client as
      | "openai"
      | "groq"
      | "qwen"
      | undefined;
    const schemaOptions = provider ? { provider } : {};
    const schema =
      schemaName === "custom"
        ? getCustomSuggestionSchema(schemaOptions)
        : getEnhancementSchema(context.isPlaceholder, schemaOptions);

    // Custom-request path: Sub-project B2 extended this to capture
    // scene_summary alongside the unwrapped suggestions. Mirrors the
    // enhancement path's captureSiblings pattern below.
    if (schemaName === "custom") {
      const customCaptured = (await StructuredOutputEnforcer.enforceJSON<
        Suggestion[]
      >(this.dependencies.aiService, prompt, {
        operation,
        schema: schema as {
          type: "object" | "array";
          required?: string[];
          items?: { required?: string[] };
        } | null,
        isArray: true,
        maxRetries: 1,
        temperature,
        captureSiblings: true,
        ...(provider ? { provider } : {}),
      })) as unknown as {
        value: Suggestion[];
        siblings: Record<string, unknown>;
      };

      const customRawSceneSummary = customCaptured.siblings?.scene_summary;
      const customSceneSummary =
        typeof customRawSceneSummary === "string" &&
        customRawSceneSummary.trim().length > 0
          ? customRawSceneSummary
          : null;

      return {
        suggestions: Array.isArray(customCaptured.value)
          ? customCaptured.value.map((suggestion) => ({
              ...suggestion,
              category: suggestion.category || policy.categoryId,
            }))
          : [],
        sceneSummary: customSceneSummary,
      };
    }

    // Enhancement path: capture scene_summary alongside the unwrapped suggestions.
    const captured = (await StructuredOutputEnforcer.enforceJSON<Suggestion[]>(
      this.dependencies.aiService,
      prompt,
      {
        operation,
        schema: schema as {
          type: "object" | "array";
          required?: string[];
          items?: { required?: string[] };
        } | null,
        isArray: true,
        maxRetries: 1,
        temperature,
        captureSiblings: true,
        ...(provider ? { provider } : {}),
      },
    )) as unknown as {
      value: Suggestion[];
      siblings: Record<string, unknown>;
    };

    const rawSceneSummary = captured.siblings?.scene_summary;
    const sceneSummary =
      typeof rawSceneSummary === "string" && rawSceneSummary.trim().length > 0
        ? rawSceneSummary
        : null;

    if (sceneSummary === null) {
      this.log.info(
        "EnhancementV2 LLM omitted scene_summary — proceeding without telemetry",
        { categoryId: policy.categoryId },
      );
    }

    const suggestions = Array.isArray(captured.value)
      ? captured.value.map((suggestion) => ({
          ...suggestion,
          category: suggestion.category || policy.categoryId,
        }))
      : [];

    return { suggestions, sceneSummary };
  }

  private _rankAndFilter(
    evaluations: ReturnType<V2CandidateScorer["scoreCandidates"]>,
    highlightedText: string,
    targetCount: number,
  ): Suggestion[] {
    const ranked = this.scorer.rankAcceptedCandidates(evaluations, targetCount);
    const echoFiltered =
      this.dependencies.diversityEnforcer.filterOriginalEchoes(
        ranked,
        highlightedText,
      );
    return this._dedupeByText(echoFiltered);
  }

  private _shouldRescue(policy: SlotPolicy, acceptedCount: number): boolean {
    return Boolean(
      policy.rescueStrategy?.enabled &&
        policy.rescueStrategy.maxCalls > 0 &&
        acceptedCount < policy.minAcceptableCount,
    );
  }

  private _expandTemplate(
    orderedSlots: string[],
    config: TemplatedPolicyConfig,
  ): Array<Record<string, string>> {
    const results: Array<Record<string, string>> = [];

    const recurse = (index: number, current: Record<string, string>): void => {
      if (index >= orderedSlots.length) {
        results.push({ ...current });
        return;
      }

      const slotName = orderedSlots[index];
      if (!slotName) {
        results.push({ ...current });
        return;
      }
      const values = config.slots[slotName] || [];
      for (const value of values) {
        current[slotName] = value;
        recurse(index + 1, current);
      }
      delete current[slotName];
    };

    recurse(0, {});
    return results;
  }

  private _matchesInvalidCombination(
    combination: Record<string, string>,
    config: TemplatedPolicyConfig,
  ): boolean {
    return (config.invalidCombinations || []).some((rule) =>
      Object.entries(rule).every(([slot, values]) => {
        const candidate = combination[slot];
        return candidate ? values.includes(candidate) : false;
      }),
    );
  }

  private _renderTemplate(
    combination: Record<string, string>,
    config: TemplatedPolicyConfig,
  ): string {
    const joinWith = config.renderRules?.joinWith || " ";
    return Object.values(combination)
      .join(joinWith)
      .replace(/\s+/g, " ")
      .trim();
  }

  private _dedupeByText(suggestions: Suggestion[]): Suggestion[] {
    const seen = new Set<string>();
    return suggestions.filter((suggestion) => {
      const key = suggestion.text.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private _groupSuggestionsByCategory(
    suggestions: Suggestion[],
  ): Array<{ category: string; suggestions: Suggestion[] }> {
    const grouped = new Map<string, Suggestion[]>();
    for (const suggestion of suggestions) {
      const category = suggestion.category || "Other";
      const existing = grouped.get(category) || [];
      existing.push(suggestion);
      grouped.set(category, existing);
    }

    return Array.from(grouped.entries()).map(([category, items]) => ({
      category,
      suggestions: items,
    }));
  }
}
