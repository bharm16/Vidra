import { logger } from "@infrastructure/Logger";
import { getVideoCost } from "@config/modelCosts";
import { VIDEO_MODELS } from "@config/modelConfig";
import {
  isPlanTierEligible,
  MODEL_TIER_REQUIREMENTS,
  resolveDefaultPlanTier,
} from "@config/subscriptionTiers";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { VideoAvailabilitySnapshot } from "@services/video-generation/types";
import type { UserCreditService } from "@services/credits/UserCreditService";
import {
  CANONICAL_PROMPT_MODEL_IDS,
  type CanonicalPromptModelId,
  type VideoModelId,
} from "@shared/videoModels";
import { isGenerable } from "@shared/modelIdentity";
import type { BillingProfileStore } from "@services/payment/BillingProfileStore";
import type { PlanTier } from "@config/subscriptionTiers";

interface AvailabilityGateOptions {
  mode: "t2v" | "i2v";
  durationSeconds: number;
  userId?: string | null;
}

interface AvailabilityGateResult {
  availableModelIds: CanonicalPromptModelId[];
  unknownModelIds: CanonicalPromptModelId[];
  filteredOut: Array<{ modelId: CanonicalPromptModelId; reason: string }>;
  snapshot: VideoAvailabilitySnapshot | null;
}

const log = logger.child({ service: "AvailabilityGateService" });
const UNKNOWN_REASONS = new Set([
  "unknown_availability",
  "video_generation_unavailable",
  "no_generation_provider",
]);

/**
 * Which generation-side id THIS deployment runs for each canonical model.
 *
 * Server-local because the values come from `VIDEO_MODELS`, several of which
 * are env-overridable (`WAN_2_5_I2V_MODEL`, `DRAFT_I2V_MODEL`). Models with
 * no adapter are simply absent.
 */
const CONFIGURED_GENERATION_ID: Partial<
  Record<CanonicalPromptModelId, VideoModelId>
> = {
  "luma-ray3": VIDEO_MODELS.LUMA_RAY3,
  "kling-2.1": VIDEO_MODELS.KLING_V2_1,
  "sora-2": VIDEO_MODELS.SORA_2,
  "veo-3": VIDEO_MODELS.VEO_3,
  "wan-2.2": VIDEO_MODELS.DRAFT,
};

/**
 * Maps canonical prompt-side ids to a representative generation-side id.
 *
 * `null` for recommendation-only models with no generation adapter (Runway).
 * The recommender still scores these, but the gate marks them
 * `no_generation_provider` so the UI can recommend them while explaining they
 * aren't directly generable here.
 *
 * Whether a model HAS an adapter is not decided here — `shared/modelIdentity.ts`
 * owns that fact for the whole codebase. This used to be a hand-written `null`
 * that could silently disagree with the rest of the app.
 */
const CANONICAL_TO_GENERATION_ID: Record<
  CanonicalPromptModelId,
  VideoModelId | null
> = Object.fromEntries(
  CANONICAL_PROMPT_MODEL_IDS.map((id) => [
    id,
    isGenerable(id) ? (CONFIGURED_GENERATION_ID[id] ?? null) : null,
  ]),
) as Record<CanonicalPromptModelId, VideoModelId | null>;

const isUserIdEligibleForCredits = (
  userId: string | null | undefined,
): boolean => {
  if (!userId) return false;
  if (userId.startsWith("api-key:")) return false;
  return true;
};

export class AvailabilityGateService {
  constructor(
    private readonly videoGenerationService: VideoGenerationService | null,
    private readonly userCreditService: UserCreditService | null,
    private readonly billingProfileStore?: BillingProfileStore | null,
  ) {}

  async filterModels(
    modelIds: CanonicalPromptModelId[],
    options: AvailabilityGateOptions,
  ): Promise<AvailabilityGateResult> {
    if (!this.videoGenerationService) {
      return {
        availableModelIds: [],
        unknownModelIds: [...modelIds],
        filteredOut: modelIds.map((modelId) => ({
          modelId,
          reason: "unknown_availability",
        })),
        snapshot: null,
      };
    }

    // Recommendation-only models (no generation adapter) bypass the snapshot
    // lookup entirely — they can't appear in VIDEO_MODELS and the
    // VideoGenerationService has no opinion on them. Mark them unknown with
    // a distinct reason so the UI can render them as "recommendable, not
    // generable here."
    const generableCanonicalIds: CanonicalPromptModelId[] = [];
    const generationIds: VideoModelId[] = [];
    const generationToCanonical = new Map<
      VideoModelId,
      CanonicalPromptModelId
    >();
    const filteredOut: Array<{
      modelId: CanonicalPromptModelId;
      reason: string;
    }> = [];
    const availableModelIds: CanonicalPromptModelId[] = [];
    const unknownModelIds: CanonicalPromptModelId[] = [];

    for (const canonicalId of modelIds) {
      const generationId = CANONICAL_TO_GENERATION_ID[canonicalId];
      if (generationId === null) {
        unknownModelIds.push(canonicalId);
        filteredOut.push({
          modelId: canonicalId,
          reason: "no_generation_provider",
        });
        continue;
      }
      generableCanonicalIds.push(canonicalId);
      generationIds.push(generationId);
      generationToCanonical.set(generationId, canonicalId);
    }

    const snapshot =
      this.videoGenerationService.getAvailabilitySnapshot(generationIds);
    const snapshotMap = new Map(
      snapshot.models.map((model) => [model.id, model]),
    );
    const planTier = await this.resolvePlanTier(options.userId);
    const entitlementByModel = new Map<
      VideoModelId,
      { entitled: boolean | undefined }
    >();

    let creditBalance: number | null = null;
    if (this.userCreditService && isUserIdEligibleForCredits(options.userId)) {
      try {
        creditBalance = await this.userCreditService.getBalance(
          options.userId as string,
        );
      } catch (error) {
        log.warn("Failed to resolve credit balance for availability gating", {
          error: error instanceof Error ? error.message : String(error),
          userId: options.userId,
        });
      }
    }

    for (let i = 0; i < generableCanonicalIds.length; i++) {
      const canonicalId = generableCanonicalIds[i]!;
      const generationId = generationIds[i]!;
      const availability = snapshotMap.get(generationId);
      if (!availability) {
        unknownModelIds.push(canonicalId);
        filteredOut.push({
          modelId: canonicalId,
          reason: "unknown_availability",
        });
        continue;
      }

      if (!availability.available) {
        const reason = availability.reason ?? "unknown_availability";
        if (UNKNOWN_REASONS.has(reason)) {
          unknownModelIds.push(canonicalId);
        }
        filteredOut.push({ modelId: canonicalId, reason });
        continue;
      }

      const entitlement = this.resolveEntitlement(planTier, generationId);
      entitlementByModel.set(generationId, entitlement);
      if (entitlement.entitled === false) {
        filteredOut.push({ modelId: canonicalId, reason: "not_entitled" });
        continue;
      }

      if (availability.entitled === false) {
        filteredOut.push({ modelId: canonicalId, reason: "not_entitled" });
        continue;
      }

      if (options.mode === "i2v") {
        const supportsI2V =
          availability.supportsI2V ?? availability.supportsImageInput;
        if (supportsI2V === false) {
          filteredOut.push({
            modelId: canonicalId,
            reason: "image_input_unsupported",
          });
          continue;
        }
      }

      if (creditBalance !== null) {
        const requiredCredits = getVideoCost(
          generationId,
          options.durationSeconds,
        );
        if (creditBalance < requiredCredits) {
          filteredOut.push({
            modelId: canonicalId,
            reason: "insufficient_credits",
          });
          continue;
        }
      }

      availableModelIds.push(canonicalId);
    }

    const snapshotWithEntitlements: VideoAvailabilitySnapshot = {
      ...snapshot,
      models: snapshot.models.map((model) => {
        const entitlement = entitlementByModel.get(model.id);
        const entitled = entitlement?.entitled;
        return {
          ...model,
          planTier,
          ...(entitled !== undefined ? { entitled } : {}),
        };
      }),
    };

    return {
      availableModelIds,
      unknownModelIds,
      filteredOut,
      snapshot: snapshotWithEntitlements,
    };
  }

  private async resolvePlanTier(userId?: string | null): Promise<PlanTier> {
    if (!userId) return "unknown";
    if (!isUserIdEligibleForCredits(userId)) return "unknown";
    if (!this.billingProfileStore) return "unknown";
    try {
      const profile = await this.billingProfileStore.getProfile(userId);
      return resolveDefaultPlanTier(profile?.planTier, "unknown");
    } catch (error) {
      log.warn("Failed to resolve plan tier for availability gating", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return "unknown";
    }
  }

  private resolveEntitlement(
    planTier: PlanTier,
    modelId: VideoModelId,
  ): { entitled: boolean | undefined } {
    const requiredTier = MODEL_TIER_REQUIREMENTS[modelId];
    if (!requiredTier) {
      return { entitled: true };
    }
    if (planTier === "unknown") {
      return { entitled: true };
    }
    return { entitled: isPlanTierEligible(planTier, requiredTier) };
  }
}
