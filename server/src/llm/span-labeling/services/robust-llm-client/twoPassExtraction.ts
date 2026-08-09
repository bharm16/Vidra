import { capabilitiesFor } from "@utils/provider/ProviderDetector";
import { logger } from "@infrastructure/Logger";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import {
  callModel,
  type ModelResponse,
  type ProviderRequestOptions,
} from "./modelInvocation";

export async function twoPassExtraction({
  systemPrompt,
  userPayload,
  aiService,
  maxTokens,
  providerOptions,
  schema,
  providerName,
  modelName,
  clientName,
}: {
  systemPrompt: string;
  userPayload: string;
  aiService: AIExecutionPort;
  maxTokens: number;
  providerOptions: ProviderRequestOptions;
  schema?: Record<string, unknown>;
  providerName: string;
  modelName?: string;
  clientName?: string;
}): Promise<ModelResponse> {
  const payloadData = JSON.parse(userPayload);

  const { capabilities } = capabilitiesFor({
    operation: "span_labeling",
    ...(modelName ? { model: modelName } : {}),
    ...(clientName ? { client: clientName } : {}),
  });

  logger.info("Using two-pass extraction for complex schema", {
    provider: providerName,
    hasDeveloperRole: capabilities.developerRole,
  });

  const reasoningPrompt = `${systemPrompt}

## Two-Pass Analysis Mode - Pass 1: REASONING

Analyze the input text and identify ALL key entities, relationships, and span boundaries.
Think step-by-step about what should be labeled.
Output your analysis in free text / markdown format.
Do NOT worry about JSON structure yet - just reason through the task.`;

  const reasoningResponse = await callModel({
    systemPrompt: reasoningPrompt,
    userPayload: JSON.stringify({
      task: "Analyze the text and provide step-by-step reasoning about what spans should be labeled.",
      policy: payloadData.policy,
      text: payloadData.text,
      templateVersion: payloadData.templateVersion,
    }),
    aiService,
    maxTokens: Math.floor(maxTokens * 0.6),
    providerOptions: {
      ...providerOptions,
      enableBookending: false,
    },
  });

  logger.debug("Pass 1 (reasoning) completed", {
    responseLength: reasoningResponse.text.length,
    provider: providerName,
  });

  const structuringPrompt = capabilities.developerRole
    ? systemPrompt
    : `${systemPrompt}

## Two-Pass Analysis Mode - Pass 2: STRUCTURING

Convert the following Pass 1 analysis into the required JSON schema format.

Pass 1 Analysis:
${reasoningResponse.text}`;

  const structuringDeveloperMessage = capabilities.developerRole
    ? `You are in STRUCTURING MODE for span labeling.

TASK: Convert the Pass 1 free-form analysis into the required JSON schema.

Pass 1 Analysis:
${reasoningResponse.text}

Convert this analysis to the required JSON format.`
    : undefined;

  const structuredResponse = await callModel({
    systemPrompt: structuringPrompt,
    userPayload: JSON.stringify({
      task: "Convert the Pass 1 analysis into structured JSON spans following the schema.",
      policy: payloadData.policy,
      text: payloadData.text,
      templateVersion: payloadData.templateVersion,
    }),
    aiService,
    maxTokens: Math.floor(maxTokens * 0.4),
    providerOptions: {
      ...providerOptions,
      developerMessage: structuringDeveloperMessage,
    },
    ...(schema && { schema }),
  });

  logger.info("Pass 2 (structuring) completed", {
    provider: providerName,
    usedDeveloperMessage: !!structuringDeveloperMessage,
  });

  return structuredResponse;
}
