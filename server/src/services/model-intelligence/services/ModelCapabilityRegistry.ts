import { MODEL_CATALOG } from "@shared/modelCatalog";
import {
  CANONICAL_PROMPT_MODEL_IDS,
  isReleaseGenerationModelSupported,
  type CanonicalPromptModelId,
} from "@shared/videoModels";
import type { ModelCapabilities } from "../types";

/**
 * Registry of model capability profiles. Backed by the canonical
 * `MODEL_CATALOG` in `shared/modelCatalog.ts` — every entry here is the
 * authoritative numeric profile for a `CanonicalPromptModelId`.
 *
 * Includes recommendation-only models (e.g. Runway) that do not have a
 * generation adapter wired in `VIDEO_MODELS`. The AvailabilityGateService
 * is responsible for translating canonical ids to generation ids and
 * surfacing recommendation-only models with `no_generation_provider`.
 */
export class ModelCapabilityRegistry {
  private readonly capabilities: Map<CanonicalPromptModelId, ModelCapabilities>;

  constructor() {
    this.capabilities = new Map(
      CANONICAL_PROMPT_MODEL_IDS.map(
        (id) => [id, MODEL_CATALOG[id].capabilities] as const,
      ),
    );
  }

  getCapabilities(modelId: CanonicalPromptModelId): ModelCapabilities | null {
    return this.capabilities.get(modelId) ?? null;
  }

  getAllModels(): CanonicalPromptModelId[] {
    return Array.from(this.capabilities.keys()).filter(
      isReleaseGenerationModelSupported,
    );
  }

  getProductionModels(): CanonicalPromptModelId[] {
    return Array.from(this.capabilities.entries())
      .filter(
        ([id, cap]) =>
          cap.qualityTier !== "preview" &&
          isReleaseGenerationModelSupported(id),
      )
      .map(([id]) => id);
  }

  updateCapability(
    modelId: CanonicalPromptModelId,
    updates: Partial<ModelCapabilities>,
  ): void {
    const existing = this.capabilities.get(modelId);
    if (!existing) return;
    this.capabilities.set(modelId, { ...existing, ...updates });
  }
}
