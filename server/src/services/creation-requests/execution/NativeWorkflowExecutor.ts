import { z } from "zod";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { AcceptedRequest, RequestSlot } from "@shared/schemas/workflow/request.schemas";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { ImageGenerationOptions } from "@services/image-generation/types";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { VideoGenerationOptions } from "@services/video-generation/types";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import {
  isWorkflowProfileRuntimeAvailable,
  resolveWorkflowAdapterBinding,
} from "@services/creation-requests/preparation/WorkflowCapabilityCatalog";
import { NativeOutputSchema, WorkflowPreflightError, type NativeOutput, type WorkflowNativeExecutor, type WorkflowSpendGuard } from "./types";

export interface NativeWorkflowExecutorDeps {
  images: Pick<ImageGenerationService, "generatePreview"> | null;
  videos: Pick<VideoGenerationService, "generateVideo" | "getModelAvailability"> | null;
  ai: AIExecutionPort | null;
  imageProviders: ReadonlySet<string>;
  spendGuard?: WorkflowSpendGuard;
  inputAccess(ownerId: string, projectId: string, versionId: string): Promise<string>;
}

/** Exact mappings only. Explicit image providers disable the native automatic fallback chain. */
export class NativeWorkflowExecutor implements WorkflowNativeExecutor {
  constructor(private readonly deps: NativeWorkflowExecutorDeps) {}

  available(profile: CapabilityProfile): boolean {
    if (this.deps.spendGuard?.qualified(profile) !== true) return false;
    const binding = resolveWorkflowAdapterBinding(profile);
    if (!binding) return false;
    const resolvedText = binding.kind === "text" && this.deps.ai ? this.deps.ai.resolveExecution(binding.operation) : undefined;
    return isWorkflowProfileRuntimeAvailable(profile, {
      imageProviders: this.deps.images ? this.deps.imageProviders : new Set(),
      videoAvailable: model => this.deps.videos?.getModelAvailability(model).available === true,
      textAvailable: Boolean(
        resolvedText &&
          (this.deps.ai?.getAvailableClients?.().includes(resolvedText.client) ?? false),
      ),
      ...(resolvedText ? { textProvider: resolvedText.client, textModel: resolvedText.model } : {}),
      ...(this.deps.spendGuard ? { spendGuard: this.deps.spendGuard } : {}),
    });
  }

  async execute(request: AcceptedRequest, slot: RequestSlot, profile: CapabilityProfile, sentInstructions: string): Promise<NativeOutput> {
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
    if (binding.kind === "image" && this.deps.images) {
      const picture = binding.requiresPrimaryImage ? await input("primary") : undefined;
      if (binding.requiresPrimaryImage && !picture) throw new WorkflowPreflightError("The picture to edit is unavailable");
      const options: ImageGenerationOptions = {
        userId: request.ownerId, provider: binding.providerId,
        aspectRatio: z.string().parse(parameters.aspectRatio),
        ...(picture ? { inputImageUrl: picture, speedMode: z.enum(["Lightly Juiced", "Juiced", "Extra Juiced", "Real Time"]).parse(parameters.speedMode), outputQuality: z.number().int().min(1).max(100).parse(parameters.outputQuality) } : {}),
        ...(slot.seed !== undefined ? { seed: slot.seed } : {}),
      };
      await reserve();
      const result = await this.deps.images.generatePreview(sentInstructions, options);
      return NativeOutputSchema.parse({ kind: "image", storagePath: result.storagePath, model: result.metadata.model, provider: "replicate" });
    }
    if (binding.kind === "video" && this.deps.videos) {
      const startImage = binding.requiresStartFrame ? await input("start-frame") : undefined;
      if (binding.requiresStartFrame && !startImage) throw new WorkflowPreflightError("The start frame is unavailable");
      const options: VideoGenerationOptions = { model: binding.endpoint, negativePrompt: z.string().parse(parameters.negativePrompt), promptExtend: z.boolean().parse(parameters.promptExpansion), ...(slot.seed === undefined ? {} : { seed: slot.seed }) };
      if (startImage) Object.assign(options, { startImage, seconds: String(z.number().parse(parameters.durationSeconds)), size: z.string().parse(parameters.resolution) });
      else {
        const aspectRatio = z.enum(["16:9", "9:16"]).parse(parameters.aspectRatio);
        Object.assign(options, { aspectRatio, size: aspectRatio === "16:9" ? "1280*720" : "720*1280", numFrames: z.number().int().parse(parameters.numFrames), fps: z.number().positive().parse(parameters.framesPerSecond) });
      }
      await reserve();
      const result = await this.deps.videos.generateVideo(sentInstructions, options);
      return NativeOutputSchema.parse({ kind: "video", assetId: result.assetId, model: binding.endpoint, provider: profile.provider });
    }
    if (binding.kind === "text" && this.deps.ai) {
      const instruction = binding.action === "ask" ? "Answer the creator's question using only the supplied conversation context. Do not claim that you made or changed media." : binding.action === "expand-description" ? "Expand the creator's description into clear visual instructions. Return only the proposed description. Do not make media or claim the draft was changed." : "Improve the creator's wording while preserving their intent. Return only the proposed wording. Do not make media or claim the draft was changed.";
      // studio_turn has no cross-provider fallback. Explicit text format overrides its JSON default.
      await reserve();
      const result = await this.deps.ai.execute(binding.operation, { systemPrompt: instruction, userMessage: sentInstructions, responseFormat: { type: "text" }, jsonMode: false, maxTokens: 4000, maxRetries: 0 });
      return NativeOutputSchema.parse({ kind: "text", text: result.text, model: result.executedBy.model, provider: result.executedBy.client });
    }
    throw new WorkflowPreflightError("This action has no supported adapter");
  }
}
