import { z } from "zod";
import type {
  CapabilitiesSchema,
  CapabilityCondition,
  CapabilityField,
  CapabilityFieldConstraints,
  CapabilityFieldUI,
  CapabilityValueRule,
  ModelFeatures,
} from "@shared/capabilities";
import { ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { ApiClient, apiClient } from "./ApiClient";

const CapabilityValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const CapabilityFieldTypeSchema = z.enum(["enum", "int", "bool", "string"]);

const CapabilityConditionSchema = z.object({
  field: z.string(),
  eq: CapabilityValueSchema.optional(),
  neq: CapabilityValueSchema.optional(),
  in: z.array(CapabilityValueSchema).optional(),
  not_in: z.array(CapabilityValueSchema).optional(),
});

const CapabilityValueRuleSchema = z.object({
  if: CapabilityConditionSchema,
  values: z.array(CapabilityValueSchema),
});

const CapabilityFieldConstraintsSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  available_if: z.array(CapabilityConditionSchema).optional(),
  disabled_if: z.array(CapabilityConditionSchema).optional(),
  available_values_if: z.array(CapabilityValueRuleSchema).optional(),
});

const CapabilityFieldUISchema = z.object({
  label: z.string().optional(),
  control: z.enum(["select", "segmented", "toggle", "input"]).optional(),
  group: z.string().optional(),
  order: z.number().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
});

const CapabilityFieldSchema = z.object({
  type: CapabilityFieldTypeSchema,
  values: z.array(CapabilityValueSchema).optional(),
  default: CapabilityValueSchema.optional(),
  constraints: CapabilityFieldConstraintsSchema.optional(),
  ui: CapabilityFieldUISchema.optional(),
});

const ModelFeaturesSchema = z.object({
  text_to_video: z.boolean(),
  image_to_video: z.boolean(),
  video_to_video: z.boolean().optional(),
});

const CapabilitiesSchemaSchema = z.object({
  provider: z.string(),
  model: z.string(),
  version: z.string(),
  source: z.string().optional(),
  generated_at: z.string().optional(),
  features: ModelFeaturesSchema.optional(),
  fields: z.record(z.string(), CapabilityFieldSchema),
  unknown_fields: z.array(z.string()).optional(),
});

const ProvidersResponseSchema = z.object({
  providers: z.array(z.string()),
});

const ModelsResponseSchema = z.object({
  provider: z.string(),
  models: z.array(z.string()),
});

const VideoAvailabilityModelSchema = z.object({
  id: z.string(),
  available: z.boolean(),
  supportsImageInput: z.boolean().optional(),
  supportsI2V: z.boolean().optional(),
  planTier: z.string().optional(),
  entitled: z.boolean().optional(),
});

const VideoAvailabilityResponseSchema = z.object({
  availableModels: z.array(z.string()),
  availableCapabilityModels: z.array(z.string()).optional(),
  models: z.array(VideoAvailabilityModelSchema).optional(),
});

const CapabilitiesRegistrySchema = z.record(
  z.string(),
  z.record(z.string(), CapabilitiesSchemaSchema),
);

type ModelsResponse = z.infer<typeof ModelsResponseSchema>;
type VideoAvailabilityResponse = z.infer<
  typeof VideoAvailabilityResponseSchema
>;
type ParsedCapabilityCondition = z.infer<typeof CapabilityConditionSchema>;
type ParsedCapabilityValueRule = z.infer<typeof CapabilityValueRuleSchema>;
type ParsedCapabilityFieldConstraints = z.infer<
  typeof CapabilityFieldConstraintsSchema
>;
type ParsedCapabilityFieldUI = z.infer<typeof CapabilityFieldUISchema>;
type ParsedCapabilityField = z.infer<typeof CapabilityFieldSchema>;
type ParsedCapabilitiesSchema = z.infer<typeof CapabilitiesSchemaSchema>;

const normalizeCondition = (
  condition: ParsedCapabilityCondition,
): CapabilityCondition => ({
  field: condition.field,
  ...(condition.eq !== undefined ? { eq: condition.eq } : {}),
  ...(condition.neq !== undefined ? { neq: condition.neq } : {}),
  ...(Array.isArray(condition.in) ? { in: condition.in } : {}),
  ...(Array.isArray(condition.not_in) ? { not_in: condition.not_in } : {}),
});

const normalizeValueRule = (
  rule: ParsedCapabilityValueRule,
): CapabilityValueRule => ({
  if: normalizeCondition(rule.if),
  values: rule.values,
});

const normalizeFieldConstraints = (
  constraints: ParsedCapabilityFieldConstraints,
): CapabilityFieldConstraints => ({
  ...(constraints.min !== undefined ? { min: constraints.min } : {}),
  ...(constraints.max !== undefined ? { max: constraints.max } : {}),
  ...(constraints.step !== undefined ? { step: constraints.step } : {}),
  ...(Array.isArray(constraints.available_if)
    ? { available_if: constraints.available_if.map(normalizeCondition) }
    : {}),
  ...(Array.isArray(constraints.disabled_if)
    ? { disabled_if: constraints.disabled_if.map(normalizeCondition) }
    : {}),
  ...(Array.isArray(constraints.available_values_if)
    ? {
        available_values_if:
          constraints.available_values_if.map(normalizeValueRule),
      }
    : {}),
});

const normalizeFieldUi = (ui: ParsedCapabilityFieldUI): CapabilityFieldUI => ({
  ...(typeof ui.label === "string" ? { label: ui.label } : {}),
  ...(ui.control ? { control: ui.control } : {}),
  ...(typeof ui.group === "string" ? { group: ui.group } : {}),
  ...(typeof ui.order === "number" ? { order: ui.order } : {}),
  ...(typeof ui.description === "string"
    ? { description: ui.description }
    : {}),
  ...(typeof ui.placeholder === "string"
    ? { placeholder: ui.placeholder }
    : {}),
});

const normalizeField = (field: ParsedCapabilityField): CapabilityField => ({
  type: field.type,
  ...(Array.isArray(field.values) ? { values: field.values } : {}),
  ...(field.default !== undefined ? { default: field.default } : {}),
  ...(field.constraints
    ? { constraints: normalizeFieldConstraints(field.constraints) }
    : {}),
  ...(field.ui ? { ui: normalizeFieldUi(field.ui) } : {}),
});

const normalizeFeatures = (
  features: ParsedCapabilitiesSchema["features"],
): ModelFeatures | undefined => {
  if (!features) {
    return undefined;
  }
  return {
    text_to_video: features.text_to_video,
    image_to_video: features.image_to_video,
    ...(typeof features.video_to_video === "boolean"
      ? { video_to_video: features.video_to_video }
      : {}),
  };
};

const normalizeCapabilitiesSchema = (
  payload: ParsedCapabilitiesSchema,
): CapabilitiesSchema => {
  const normalizedFeatures = normalizeFeatures(payload.features);
  return {
    provider: payload.provider,
    model: payload.model,
    version: payload.version,
    ...(typeof payload.source === "string" ? { source: payload.source } : {}),
    ...(typeof payload.generated_at === "string"
      ? { generated_at: payload.generated_at }
      : {}),
    ...(normalizedFeatures ? { features: normalizedFeatures } : {}),
    fields: Object.fromEntries(
      Object.entries(payload.fields).map(([key, value]) => [
        key,
        normalizeField(value),
      ]),
    ),
    ...(Array.isArray(payload.unknown_fields)
      ? { unknown_fields: payload.unknown_fields }
      : {}),
  };
};

type RegistryResponse = Record<string, Record<string, CapabilitiesSchema>>;

export class CapabilitiesApi {
  private registryInFlight: Promise<RegistryResponse> | null = null;

  constructor(private readonly client: ApiClient) {}

  async getCapabilities(
    provider: string,
    model: string,
  ): Promise<CapabilitiesSchema> {
    const encodedProvider = encodeURIComponent(provider);
    const encodedModel = encodeURIComponent(model);
    const parsed = ApiSuccessResponseSchema(CapabilitiesSchemaSchema).parse(
      await this.client.get(
        `/capabilities?provider=${encodedProvider}&model=${encodedModel}`,
      ),
    );
    return normalizeCapabilitiesSchema(parsed.data);
  }

  async listProviders(): Promise<string[]> {
    const parsed = ApiSuccessResponseSchema(ProvidersResponseSchema).parse(
      await this.client.get("/providers"),
    );
    return parsed.data.providers;
  }

  async listModels(provider: string): Promise<ModelsResponse> {
    const encodedProvider = encodeURIComponent(provider);
    const parsed = ApiSuccessResponseSchema(ModelsResponseSchema).parse(
      await this.client.get(`/models?provider=${encodedProvider}`),
    );
    return parsed.data;
  }

  // Coalesces concurrent callers (useModelRegistry + useCapabilityRegistry mount
  // simultaneously in ShotEditor) onto a single network request. The promise is
  // cleared after settle so a subsequent mount refetches.
  async getRegistry(): Promise<RegistryResponse> {
    if (this.registryInFlight) {
      return this.registryInFlight;
    }
    const request = (async (): Promise<RegistryResponse> => {
      const parsed = ApiSuccessResponseSchema(CapabilitiesRegistrySchema).parse(
        await this.client.get("/registry"),
      ).data;
      return Object.fromEntries(
        Object.entries(parsed).map(([provider, models]) => [
          provider,
          Object.fromEntries(
            Object.entries(models).map(([modelId, capability]) => [
              modelId,
              normalizeCapabilitiesSchema(capability),
            ]),
          ),
        ]),
      );
    })();
    this.registryInFlight = request;
    try {
      return await request;
    } finally {
      this.registryInFlight = null;
    }
  }

  async getVideoAvailability(): Promise<VideoAvailabilityResponse> {
    return VideoAvailabilityResponseSchema.parse(
      await this.client.get("/preview/video/availability"),
    );
  }
}

export const capabilitiesApi = new CapabilitiesApi(apiClient);
