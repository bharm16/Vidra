import { assertNoLegacyApiKeyData } from "@utils/apiKeyUser";
import { z } from "zod";
import { stripPreviewSections } from "@services/image-generation/promptSanitization";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { AcceptedRequest, RequestSlot } from "@shared/schemas/workflow/request.schemas";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import { buildReplicateInput } from "@services/video-generation/providers/replicateProvider";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { executeReplicateModel, type ReplicateModelServices } from "@services/creation-requests/replicate-models/executeReplicateModel";
import type { ModelCall } from "@services/creation-requests/replicate-models";
import {
  isWorkflowProfileRuntimeAvailable,
  resolveWorkflowAdapterBinding,
} from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { NativeOutputSchema, WorkflowPreflightError, type ExecutionAttempt, type NativeOutput, type VerifiedOutput, type WorkflowNativeExecutor, type WorkflowSpendGuard } from "./types";

export interface NativeWorkflowExecutorDeps {
  videos: Pick<VideoGenerationService, "getModelAvailability"> | null;
  ai: AIExecutionPort | null;
  imageProviders: ReadonlySet<string>;
  spendGuard?: WorkflowSpendGuard;
  prepareVideoInput?(url: string, signal: AbortSignal): Promise<string | Blob>;
  inputAccess(ownerId: string, projectId: string, versionId: string): Promise<string>;
  /** Exact native Replicate models; null when Replicate is unconfigured or replaying. */
  models?: ReplicateModelServices | null;
  /** The exact input version, for model checks that need its verified metadata. */
  inputVersion?(ownerId: string, projectId: string, versionId: string): Promise<MediaVersion | undefined>;
}

/** Exact mappings return provider evidence; delivery owns downloads and uploads. No provider fallback. */
export class NativeWorkflowExecutor implements WorkflowNativeExecutor {
  constructor(private readonly deps: NativeWorkflowExecutorDeps) {}

  available(profile: CapabilityProfile): boolean {
    if (this.deps.spendGuard?.qualified(profile) !== true) return false;
    const binding = resolveWorkflowAdapterBinding(profile);
    if (!binding) return false;
    const resolvedText = binding.kind === "text" && this.deps.ai ? this.deps.ai.resolveExecution(binding.operation) : undefined;
    return isWorkflowProfileRuntimeAvailable(profile, {
      imageProviders: this.deps.models ? this.deps.imageProviders : new Set(),
      videoAvailable: model => Boolean(this.deps.models) && this.deps.videos?.getModelAvailability(model).available === true,
      textAvailable: Boolean(
        resolvedText &&
          (this.deps.ai?.getAvailableClients?.().includes(resolvedText.client) ?? false),
      ),
      ...(resolvedText ? { textProvider: resolvedText.client, textModel: resolvedText.model } : {}),
      replicateAvailable: Boolean(this.deps.models),
      ...(this.deps.spendGuard ? { spendGuard: this.deps.spendGuard } : {}),
    });
  }

  async execute(request: AcceptedRequest, slot: RequestSlot, profile: CapabilityProfile, sentInstructions: string): Promise<NativeOutput> {
    try { assertNoLegacyApiKeyData(request.ownerId); } catch { throw new WorkflowPreflightError("This action owner is unavailable."); }
    if (!this.available(profile) || request.snapshot.action !== profile.action) throw new WorkflowPreflightError("This exact adapter is unavailable");
    const spendGuard = this.deps.spendGuard;
    if (!spendGuard) throw new WorkflowPreflightError("This action is unavailable during bounded free testing.");
    const reserve = async (): Promise<void> => { if (!await spendGuard.reserve(request, slot, profile)) throw new WorkflowPreflightError("This action already has a provider reservation. Reconcile its existing result instead of submitting it again."); };
    const parameters = request.snapshot.settings.parameters;
    const input = async (role: string): Promise<string | undefined> => {
      const source = request.snapshot.inputs.find(candidate => candidate.role === role);
      if (!source) return undefined;
      try { return await this.deps.inputAccess(request.ownerId, request.projectId, source.versionId); }
      catch { throw new WorkflowPreflightError("This selected input is unavailable"); }
    };
    const binding = resolveWorkflowAdapterBinding(profile);
    if (!binding) throw new WorkflowPreflightError("This action has no supported adapter");
    if ((binding.kind === "image" || binding.kind === "video") && this.deps.models) {
      let providerInput: Record<string, unknown>;
      if (binding.kind === "image") {
        const picture = binding.requiresPrimaryImage ? await input("primary") : undefined;
        if (binding.requiresPrimaryImage && !picture) throw new WorkflowPreflightError("The picture to edit is unavailable");
        providerInput = { prompt: stripPreviewSections(sentInstructions.trim()), aspect_ratio: z.string().parse(parameters.aspectRatio), output_format: "webp", output_quality: 80,
          ...(picture ? { img_cond_path: picture, speed_mode: z.string().parse(parameters.speedMode), output_quality: z.number().parse(parameters.outputQuality) } : {}),
          ...(slot.seed === undefined ? {} : { seed: slot.seed }) };
      } else {
        const startImage = binding.requiresStartFrame ? await input("start-frame") : undefined;
        if (binding.requiresStartFrame && !startImage) throw new WorkflowPreflightError("The start frame is unavailable");
        providerInput = buildReplicateInput(profile.endpoint, sentInstructions, {
          negativePrompt: z.string().parse(parameters.negativePrompt), promptExtend: z.boolean().parse(parameters.promptExpansion),
          size: z.string().parse(parameters.resolution), ...(slot.seed === undefined ? {} : { seed: slot.seed }),
          ...(startImage ? { startImage, seconds: z.enum(["5", "10"]).parse(String(parameters.durationSeconds)) } : { aspectRatio: z.enum(["16:9", "9:16"]).parse(parameters.aspectRatio), numFrames: z.number().int().parse(parameters.numFrames), fps: z.number().positive().parse(parameters.framesPerSecond) }),
        });
      }
      if (binding.kind === "video" && typeof providerInput.image === "string") {
        try { if (!this.deps.prepareVideoInput) throw new Error("Start-frame preparation is unavailable"); providerInput.image = await this.deps.prepareVideoInput(providerInput.image, AbortSignal.timeout(120000)); }
        catch { throw new WorkflowPreflightError("The selected start frame could not be prepared."); }
      }
      await reserve();
      const result = await this.deps.models.runner.run({ model: profile.endpoint, input: providerInput, userId: request.ownerId, timeoutMs: profile.recovery.deadlineSeconds * 1000, pollIntervalMs: 1000 });
      const sourceUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      return NativeOutputSchema.parse({ kind: "provider-media", mediaKind: binding.kind, sourceUrl, predictionId: result.predictionId, model: profile.endpoint, provider: profile.provider });
    }
    if (binding.kind === "text" && this.deps.ai) {
      const instruction = binding.action === "ask" ? "Answer the creator's question using only the supplied conversation context. Do not claim that you made or changed media." : binding.action === "expand-description" ? "Expand the creator's description into clear visual instructions. Return only the proposed description. Do not make media or claim the draft was changed." : "Improve the creator's wording while preserving their intent. Return only the proposed wording. Do not make media or claim the draft was changed.";
      // studio_turn has no cross-provider fallback. Explicit text format overrides its JSON default.
      await reserve();
      const result = await this.deps.ai.execute(binding.operation, { systemPrompt: instruction, userMessage: sentInstructions, responseFormat: { type: "text" }, jsonMode: false, maxTokens: 4000, maxRetries: 0 });
      return NativeOutputSchema.parse({ kind: "text", text: result.text, model: result.executedBy.model, provider: result.executedBy.client });
    }
    if (binding.kind === "replicate" && this.deps.models) {
      const inputs: ModelCall["inputs"] = {};
      for (const source of request.snapshot.inputs) {
        let version: MediaVersion | undefined;
        let sourceUrl: string;
        try {
          sourceUrl = await this.deps.inputAccess(request.ownerId, request.projectId, source.versionId);
          version = await this.deps.inputVersion?.(request.ownerId, request.projectId, source.versionId);
        } catch { throw new WorkflowPreflightError("This selected input is unavailable"); }
        (inputs[source.role] ??= []).push({ url: sourceUrl, ...(version ? { version } : {}) });
      }
      const call: ModelCall = { instructions: request.snapshot.instructions, sentInstructions, parameters, inputs, ...(slot.seed === undefined ? {} : { seed: slot.seed }) };
      return executeReplicateModel(binding.definition, call, { ownerId: request.ownerId, slotId: slot.id }, this.deps.models, reserve);
    }
    throw new WorkflowPreflightError("This action has no supported adapter");
  }

  async checkOutput(attempt: ExecutionAttempt, verified: VerifiedOutput): Promise<void> {
    await this.deps.spendGuard?.checkOutput?.(attempt, verified);
  }
}
