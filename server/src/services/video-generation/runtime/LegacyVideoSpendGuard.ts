import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { isKnownGenerationModelInput, resolveGenerationModelSelection } from "@config/videoModelRegistry";
import { isReleaseGenerationModelSupported } from "@shared/videoModels";
import { isLegacyApiKeyUid } from "@utils/apiKeyUser";
import { sha256Hex } from "@utils/hash";
import type { VideoGenerationOptions } from "../types";
import type { VideoJobRecord } from "./types";
import { VideoJobRecordSchema } from "./schemas";

export class LegacyVideoSpendRefusedError extends Error {}

export interface LegacyVideoDispatchSpendPort {
  /** Only the transaction creating a permanent dispatch marker grants a call. */
  authorize(job: VideoJobRecord, workerId: string): Promise<{ options: VideoGenerationOptions } | null>;
}

/** The shared Studio policy/counter authority, supplied by the composition root. */
export interface LegacyVideoSpendAuthority {
  reserve(transaction: Transaction, input: { ownerId: string; day: string; profile: CapabilityProfile }): Promise<{
    authority: "studio_usage/v1"; day: string; cents: number; policyRevision: string; mappingHash: string;
  }>;
}

const common = {
  model: z.string().optional(),
  size: z.enum(["480p", "720p", "1080p"]).optional(),
  promptExtend: z.boolean().optional(),
  negativePrompt: z.string().optional(),
};
const TextOptions = z.strictObject({ ...common, aspectRatio: z.enum(["16:9", "9:16"]).optional(), numFrames: z.union([z.literal(81), z.literal(121)]).optional(), fps: z.literal(16).optional() });
const ImageOptions = z.strictObject({ ...common, startImage: z.string().min(1), seconds: z.enum(["5", "10"]).optional() });

/** Only the two existing reviewed legacy Wan adapter envelopes may dispatch. */
export function reviewedLegacyVideoDispatch(raw: unknown, profiles: readonly CapabilityProfile[]): { profile: CapabilityProfile; options: VideoGenerationOptions } {
  const refuse = (): never => { throw new LegacyVideoSpendRefusedError("Unsupported legacy video settings: choose a model and settings qualified for bounded free testing."); };
  const selection = z.object({ model: z.string().optional() }).parse(raw);
  if (selection.model !== undefined) {
    const supplied = selection.model.trim();
    if (!supplied || (supplied.toLowerCase() !== "auto" && !isKnownGenerationModelInput(supplied)) || !isReleaseGenerationModelSupported(supplied)) return refuse();
  }
  const model = resolveGenerationModelSelection(selection.model).modelId;
  const profile = profiles.find(candidate => candidate.id === (model === "wan-video/wan-2.2-t2v-fast" ? "wan-2.2-t2v" : model === "wan-video/wan-2.5-i2v" ? "wan-2.5-i2v" : "") && candidate.endpoint === model);
  if (!profile) return refuse();
  const negative = profile.parameters.negativePrompt;
  const expansion = profile.parameters.promptExpansion;
  if (negative?.policy !== "fixed" || typeof negative.value !== "string" || expansion?.policy !== "fixed" || typeof expansion.value !== "boolean") return refuse();
  if (profile.id === "wan-2.2-t2v") {
    const parsed = TextOptions.safeParse(raw);
    if (!parsed.success) return refuse();
    const value = parsed.data;
    if ((value.size !== undefined && value.size !== "720p") || (value.promptExtend !== undefined && value.promptExtend !== expansion.value) || (value.negativePrompt !== undefined && value.negativePrompt !== negative.value)) return refuse();
    // Pin provider defaults to the same values the reviewed workflow sends.
    return { profile, options: { model, size: "720p", aspectRatio: value.aspectRatio ?? "16:9", numFrames: value.numFrames ?? 81, fps: 16, promptExtend: expansion.value, negativePrompt: negative.value } };
  }
  const parsed = ImageOptions.safeParse(raw);
  if (!parsed.success) return refuse();
  const value = parsed.data;
  if ((value.promptExtend !== undefined && value.promptExtend !== expansion.value) || (value.negativePrompt !== undefined && value.negativePrompt !== negative.value)) return refuse();
  return { profile, options: { model, startImage: value.startImage, size: value.size ?? "720p", seconds: value.seconds ?? "5", promptExtend: expansion.value, negativePrompt: negative.value } };
}

/** A retry has a new charged dispatch identity; an expired lease never reuses one. */
export class LegacyVideoSpendGuard implements LegacyVideoDispatchSpendPort {
  constructor(private readonly database: Firestore, private readonly authority: LegacyVideoSpendAuthority, private readonly profiles: readonly CapabilityProfile[], private readonly now: () => number = Date.now) {}

  async authorize(job: VideoJobRecord, workerId: string): Promise<{ options: VideoGenerationOptions } | null> {
    if (isLegacyApiKeyUid(job.userId)) throw new LegacyVideoSpendRefusedError("This legacy dispatch owner is unavailable.");
    if (!Number.isSafeInteger(job.attempts) || job.attempts < 1) throw new LegacyVideoSpendRefusedError("Unsupported legacy dispatch identity.");
    return this.database.runTransaction(async transaction => {
      const jobRef = this.database.collection("video_jobs").doc(job.id);
      const dispatchRef = jobRef.collection("provider_dispatches").doc(String(job.attempts));
      const [row, dispatch] = await Promise.all([transaction.get(jobRef), transaction.get(dispatchRef)]);
      if (!row.exists) return null;
      const raw = row.data();
      const current = VideoJobRecordSchema.parse(raw);
      if (current.userId !== job.userId || canonicalJson(current.request) !== canonicalJson(job.request)) throw new LegacyVideoSpendRefusedError("Unsupported legacy dispatch identity.");
      if (current.status !== "processing" || current.workerId !== workerId || current.attempts !== job.attempts || !current.leaseExpiresAtMs || current.leaseExpiresAtMs <= this.now()) return null;
      if (job.attempts > (current.maxAttempts ?? 3)) throw new LegacyVideoSpendRefusedError("The bounded legacy dispatch attempts are exhausted.");
      if (dispatch.exists) return null;
      if (current.attempts > 1) throw new LegacyVideoSpendRefusedError("This job has already consumed its generation attempt. Recover confirmed output or start a new request.");
      // Inspect unstripped persisted options: unknown fields cannot disappear into qualification.
      const persisted = z.object({ request: z.object({ options: z.unknown() }) }).parse(raw);
      let reviewed: ReturnType<typeof reviewedLegacyVideoDispatch>;
      try { reviewed = reviewedLegacyVideoDispatch(persisted.request.options, this.profiles); }
      catch (error) { if (error instanceof LegacyVideoSpendRefusedError) throw error; throw new LegacyVideoSpendRefusedError("Unsupported legacy video settings."); }
      if (current.request.prompt.length > reviewed.profile.maxContextCharacters) throw new LegacyVideoSpendRefusedError("Unsupported legacy video prompt length.");
      const at = this.now();
      const spend = await this.authority.reserve(transaction, { ownerId: current.userId, day: new Date(at).toISOString().slice(0, 10), profile: reviewed.profile });
      transaction.create(dispatchRef, { ownerId: current.userId, jobId: job.id, attempt: job.attempts, workerId, requestHash: sha256Hex(canonicalJson(current.request)), profileId: reviewed.profile.id, dispatchOptionsHash: sha256Hex(canonicalJson(reviewed.options)), reservedAtMs: at, spend });
      return { options: reviewed.options };
    });
  }
}
