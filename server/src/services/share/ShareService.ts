import { randomUUID } from "node:crypto";
import { ShareRecordSchema } from "./types";
import { assertNoLegacyApiKeyData, isLegacyApiKeyUid } from "@utils/apiKeyUser";
import { ShareError } from "./ShareError";
import type { SessionPromptVersionEntry } from "@shared/types/session";
import type {
  CreateShareRequest,
  PublicClipDto,
} from "@shared/schemas/share.schemas";
import type {
  ShareRecordStore,
  ShareSessionReader,
  ShareUrlResolver,
  ShareJobReader,
  ShareRecord,
  ShareVideoJob,
} from "./types";

/**
 * Public clip sharing (ADR-0010 site-scope D8).
 *
 * `mint` is owner-scoped and opt-in: only the clip's owner can turn one of
 * their clips into a public, unguessable share id. `resolve` is the public
 * read path — it returns a fresh view URL + the paired description and nothing
 * else, so a clip is exposed only after an explicit Share, never by guessing a
 * session/prompt id.
 */
export class ShareService {
  constructor(
    private readonly store: ShareRecordStore,
    private readonly sessions: ShareSessionReader,
    private readonly urls: ShareUrlResolver,
    private readonly jobs: ShareJobReader | null = null,
  ) {}

  async mint(
    userId: string,
    req: CreateShareRequest,
  ): Promise<{ shareId: string }> {
    assertNoLegacyApiKeyData(userId);
    const session = await this.sessions.getSession(req.sessionId);
    // Owner-scoped. A missing session and a non-owner are indistinguishable
    // to the caller — both 404 — so a share cannot probe for others' sessions.
    if (!session || session.id !== req.sessionId || session.userId !== userId) {
      throw new ShareError("SHARE_CLIP_NOT_FOUND", "Clip not found");
    }

    // A generation lives in exactly one version — find it across all of them
    // so the caller needs only the session + generation ids, not the version.
    const versions = Array.isArray(session.prompt?.versions)
      ? session.prompt.versions
      : [];
    let generation: Record<string, unknown> | undefined;
    let version: SessionPromptVersionEntry | undefined;
    for (const candidate of versions) {
      const gens = Array.isArray(candidate.generations)
        ? candidate.generations
        : [];
      const match = gens.find(
        (g) => typeof g.id === "string" && g.id === req.generationId,
      );
      if (match) {
        generation = match;
        version = candidate;
        break;
      }
    }
    if (!generation) {
      throw new ShareError("SHARE_CLIP_NOT_FOUND", "Clip not found");
    }

    const storagePath =
      typeof generation.storagePath === "string" ? generation.storagePath : "";
    if (!storagePath) {
      throw new ShareError(
        "SHARE_NO_MEDIA",
        "This clip has no shareable media yet",
      );
    }

    assertNoLegacyApiKeyData(storagePath);
    const resource = await this.authorizeResource(userId, req.sessionId, req.generationId, version?.versionId, generation, storagePath);
    if (!resource) throw new ShareError("SHARE_CLIP_NOT_FOUND", "Clip not found");

    const shareId = randomUUID();
    await this.store.save({
      schemaVersion: "public-clip/v2",
      shareId,
      ownerId: userId,
      sessionId: req.sessionId,
      generationId: req.generationId,
      resource,
      storagePath,
      description: this.pickDescription(generation, version),
      model: typeof generation.model === "string" ? generation.model : null,
      createdAt: new Date().toISOString(),
    });
    return { shareId };
  }

  async resolve(shareId: string): Promise<PublicClipDto | null> {
    if (!ShareRecordSchema.shape.shareId.safeParse(shareId).success) return null;
    const record = await this.store.get(shareId);
    if (!record) return null;
    const parsed = ShareRecordSchema.safeParse(record);
    if (!parsed.success || parsed.data.shareId !== shareId) return null;
    const verified = parsed.data;
    try { assertNoLegacyApiKeyData(verified.storagePath); } catch { return null; }
    if (!safeObjectPath(verified.storagePath)) return null;
    if (verified.resource.kind === "owner-path") {
      if (!ownedClipPath(verified.ownerId, verified.storagePath)) return null;
    } else {
      const job = await this.jobs?.getJob(verified.resource.jobId);
      if (!job || job.result?.assetId !== verified.resource.assetId || !this.matchesJob(job, verified.ownerId, verified.sessionId, verified.storagePath)) return null;
    }
    const { viewUrl } = await this.urls.getSharedViewUrl(verified.storagePath);
    return {
      videoUrl: viewUrl,
      description: record.description,
      model: record.model,
      createdAt: record.createdAt,
    };
  }

  private async authorizeResource(
    ownerId: string,
    sessionId: string,
    generationId: string,
    versionId: string | undefined,
    generation: Record<string, unknown>,
    storagePath: string,
  ): Promise<ShareRecord["resource"] | null> {
    if (!safeObjectPath(storagePath)) return null;
    // Historical/imported owned clips need no retained job to prove ownership.
    if (ownedClipPath(ownerId, storagePath)) return { kind: "owner-path" };
    // A foreign user's namespace can never be rescued through a job claim.
    if (storagePath.startsWith("users/") || !this.jobs) return null;
    const matches = (job: ShareVideoJob | null): job is ShareVideoJob => Boolean(job && this.matchesJob(job, ownerId, sessionId, storagePath) && (!job.promptVersionId || job.promptVersionId === versionId));
    const direct = /^[A-Za-z0-9_-]{1,200}$/.test(generationId) ? await this.jobs.getJob(generationId) : null;
    if (matches(direct) && direct.result) return { kind: "video-job", jobId: direct.id, assetId: direct.result.assetId };
    // Older take IDs differ from their job IDs; the stored result still proves
    // the owner and exact object, independently of the mutable session claim.
    const assetId = Array.isArray(generation.mediaAssetIds)
      ? generation.mediaAssetIds.find((value): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,240}$/.test(value))
      : undefined;
    const legacy = assetId ? await this.jobs.findJobByAssetId(assetId) : null;
    if (!matches(legacy) || !legacy.result || legacy.result.assetId !== assetId) return null;
    return { kind: "video-job", jobId: legacy.id, assetId: legacy.result.assetId };
  }

  private matchesJob(job: ShareVideoJob, ownerId: string, sessionId: string, storagePath: string): boolean {
    return job.userId === ownerId && !isLegacyApiKeyUid(job.userId) && job.status === "completed" &&
      (!job.sessionId || job.sessionId === sessionId) && job.result?.storagePath === storagePath && job.result.contentType.startsWith("video/");
  }

  /** The clip's own prose, falling back to the version's words. */
  private pickDescription(
    generation: Record<string, unknown>,
    version: SessionPromptVersionEntry | undefined,
  ): string {
    if (typeof generation.prompt === "string" && generation.prompt.trim()) {
      return generation.prompt;
    }
    if (version && typeof version.prompt === "string" && version.prompt.trim()) {
      return version.prompt;
    }
    return "";
  }
}

function safeObjectPath(path: string): boolean {
  return path.length <= 2048 && !path.includes("://") && !path.includes("\\") &&
    ![...path].some(character => character.charCodeAt(0) < 32) &&
    path.split("/").every(segment => segment !== "" && segment !== "." && segment !== "..");
}

function ownedClipPath(ownerId: string, path: string): boolean {
  if (isLegacyApiKeyUid(ownerId)) return false;
  const parts = path.split("/");
  return parts[0] === "users" && parts[1] === ownerId &&
    ((parts.length === 4 && parts[2] === "generations") ||
      (parts.length === 5 && parts[2] === "previews" && parts[3] === "videos"));
}
