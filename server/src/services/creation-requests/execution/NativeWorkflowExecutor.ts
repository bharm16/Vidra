import { z } from "zod";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { AcceptedRequest, RequestSlot } from "@shared/schemas/workflow/request.schemas";
import type { ImageGenerationService } from "@services/image-generation/ImageGenerationService";
import type { ImageGenerationOptions } from "@services/image-generation/types";
import type { VideoGenerationService } from "@services/video-generation/VideoGenerationService";
import type { VideoGenerationOptions } from "@services/video-generation/types";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { NativeOutputSchema, WorkflowPreflightError, type NativeOutput, type WorkflowNativeExecutor, type WorkflowSpendGuard } from "./types";

export interface NativeWorkflowExecutorDeps {
  images: Pick<ImageGenerationService, "generatePreview"> | null;
  videos: Pick<VideoGenerationService, "generateVideo" | "getModelAvailability"> | null;
  ai: AIExecutionPort | null;
  imageProviders: ReadonlySet<string>;
  spendGuard?: WorkflowSpendGuard;
  inputAccess(ownerId: string, projectId: string, versionId: string): Promise<string>;
}

const TEXT_ACTIONS = new Set(["ask", "expand-description", "improve-words"]);

/** Exact mappings only. Explicit image providers disable the native automatic fallback chain. */
export class NativeWorkflowExecutor implements WorkflowNativeExecutor {
  constructor(private readonly deps: NativeWorkflowExecutorDeps) {}

  available(profile: CapabilityProfile): boolean {
    if (profile.availability !== "qualified") return false;
    if (this.deps.spendGuard?.qualified(profile) !== true) return false;
    if (profile.id === "flux-schnell") return Boolean(this.deps.images && this.deps.imageProviders.has("replicate-flux-schnell"));
    if (profile.id === "flux-kontext-fast") return Boolean(this.deps.images && this.deps.imageProviders.has("replicate-flux-kontext-fast"));
    if (profile.id === "wan-2.2-t2v" || profile.id === "wan-2.5-i2v") return this.deps.videos?.getModelAvailability(profile.endpoint).available === true;
    if (TEXT_ACTIONS.has(profile.action) && this.deps.ai) {
      const resolved = this.deps.ai.resolveExecution("studio_turn");
      return (this.deps.ai.getAvailableClients?.().includes(resolved.client) ?? false) && resolved.client === profile.provider && resolved.model === profile.endpoint;
    }
    return false;
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
    if ((profile.id === "flux-schnell" || profile.id === "flux-kontext-fast") && this.deps.images) {
      const picture = profile.id === "flux-kontext-fast" ? await input("primary") : undefined;
      if (profile.id === "flux-kontext-fast" && !picture) throw new WorkflowPreflightError("The picture to edit is unavailable");
      const options: ImageGenerationOptions = {
        userId: request.ownerId, provider: profile.id === "flux-schnell" ? "replicate-flux-schnell" : "replicate-flux-kontext-fast",
        aspectRatio: z.string().parse(parameters.aspectRatio),
        ...(picture ? { inputImageUrl: picture, speedMode: z.enum(["Lightly Juiced", "Juiced", "Extra Juiced", "Real Time"]).parse(parameters.speedMode), outputQuality: z.number().int().min(1).max(100).parse(parameters.outputQuality) } : {}),
        ...(slot.seed !== undefined ? { seed: slot.seed } : {}),
      };
      await reserve();
      const result = await this.deps.images.generatePreview(sentInstructions, options);
      return NativeOutputSchema.parse({ kind: "image", storagePath: result.storagePath, model: result.metadata.model, provider: "replicate" });
    }
    if ((profile.id === "wan-2.2-t2v" || profile.id === "wan-2.5-i2v") && this.deps.videos) {
      const startImage = profile.id === "wan-2.5-i2v" ? await input("start-frame") : undefined;
      if (profile.id === "wan-2.5-i2v" && !startImage) throw new WorkflowPreflightError("The start frame is unavailable");
      const options: VideoGenerationOptions = { model: profile.endpoint, negativePrompt: z.string().parse(parameters.negativePrompt), promptExtend: z.boolean().parse(parameters.promptExpansion), ...(slot.seed === undefined ? {} : { seed: slot.seed }) };
      if (startImage) Object.assign(options, { startImage, seconds: String(z.number().parse(parameters.durationSeconds)), size: z.string().parse(parameters.resolution) });
      else {
        const aspectRatio = z.enum(["16:9", "9:16"]).parse(parameters.aspectRatio);
        Object.assign(options, { aspectRatio, size: aspectRatio === "16:9" ? "1280*720" : "720*1280", numFrames: z.number().int().parse(parameters.numFrames), fps: z.number().positive().parse(parameters.framesPerSecond) });
      }
      await reserve();
      const result = await this.deps.videos.generateVideo(sentInstructions, options);
      return NativeOutputSchema.parse({ kind: "video", assetId: result.assetId, model: profile.endpoint, provider: profile.provider });
    }
    if (TEXT_ACTIONS.has(profile.action) && this.deps.ai) {
      const instruction = profile.action === "ask" ? "Answer the creator's question using only the supplied conversation context. Do not claim that you made or changed media." : profile.action === "expand-description" ? "Expand the creator's description into clear visual instructions. Return only the proposed description. Do not make media or claim the draft was changed." : "Improve the creator's wording while preserving their intent. Return only the proposed wording. Do not make media or claim the draft was changed.";
      // studio_turn has no cross-provider fallback. Explicit text format overrides its JSON default.
      await reserve();
      const result = await this.deps.ai.execute("studio_turn", { systemPrompt: instruction, userMessage: sentInstructions, responseFormat: { type: "text" }, jsonMode: false, maxTokens: 4000, maxRetries: 0 });
      return NativeOutputSchema.parse({ kind: "text", text: result.text, model: result.executedBy.model, provider: result.executedBy.client });
    }
    throw new WorkflowPreflightError("This action has no supported adapter");
  }
}
