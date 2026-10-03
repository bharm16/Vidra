export const COMPLETION_PROVIDERS = [
  "fal",
  "replicate",
  "google",
  "openai-text",
] as const;
export type CompletionProvider = (typeof COMPLETION_PROVIDERS)[number];
export const COMPLETION_PROMPT =
  "A red ceramic cup sits on a wooden table in soft morning light. The camera slowly moves closer.";
export const COMPLETION_TEXT_PROMPT =
  'Return one JSON object: {"ok":true}. This is a provider connectivity test.';

export interface CompletionPlan {
  provider: CompletionProvider;
  model: string;
  reserveCents: number;
  pricingSource: string;
  derivation: string;
  configuration: Record<string, unknown>;
}

export const COMPLETION_PLANS: readonly CompletionPlan[] = [
  {
    provider: "fal",
    model: "fal-ai/z-image/turbo/image-to-image",
    reserveCents: 2,
    pricingSource: "https://fal.ai/models/fal-ai/z-image/turbo/image-to-image",
    derivation:
      "$0.005/MP; one image, at most 4MP => $0.02 reserved; source 512x512.",
    configuration: {
      sourceWidth: 512,
      sourceHeight: 512,
      strength: 0.6,
      num_inference_steps: 8,
      seed: 20261003,
      output_format: "webp",
      sync_mode: true,
    },
  },
  {
    provider: "replicate",
    model: "wan-video/wan-2.2-i2v-fast",
    reserveCents: 20,
    pricingSource: "https://replicate.com/wan-video/wan-2.2-i2v-fast",
    derivation:
      "Official model current_tiers: base480p $0.05, base720p $0.11, interpolated720p $0.145/output; one81-frame16fps output, reserve $0.20 without interpolation.",
    configuration: {
      source: "the single fal output",
      numFrames: 81,
      fps: 16,
      promptExtend: false,
      seed: 20261003,
      aspectRatio: "1:1",
      providerResolutionDefault: "480p",
    },
  },
  {
    provider: "google",
    model: "veo-3.1-generate-preview",
    reserveCents: 160,
    pricingSource: "https://ai.google.dev/gemini-api/docs/pricing#veo-3.1",
    derivation:
      "Standard720p video+audio $0.40/s x4s x1 output = $1.60. Official Veo parameter guide permits4s at720p without references/extension.",
    configuration: {
      seconds: "4",
      size: "720p",
      aspectRatio: "16:9",
      seed: 20261003,
    },
  },
  {
    provider: "openai-text",
    model: "gpt-5.6-luna",
    reserveCents: 5,
    pricingSource: "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
    derivation:
      "Input$0.20/M + output$1.20/M; <4096 prompt bytes +1024 output tokens is under $0.003; reserve $0.05. Real aiService studio_turn text, not retired video API.",
    configuration: {
      operation: "studio_turn",
      maxTokens: 1024,
      maxRetries: 0,
      retryOnValidationFailure: false,
      logprobs: false,
      responseFormat: "json_object",
    },
  },
];

export const COMPLETION_RESERVED_CENTS = COMPLETION_PLANS.reduce(
  (sum, plan) => sum + plan.reserveCents,
  0,
);
