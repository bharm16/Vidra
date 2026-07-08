import { randomUUID } from "node:crypto";
import { AppError } from "@server/types/common";
import type { SessionPromptVersionEntry } from "@shared/types/session";
import type {
  CreateShareRequest,
  PublicClipDto,
} from "@shared/schemas/share.schemas";
import type {
  ShareRecordStore,
  ShareSessionReader,
  ShareUrlResolver,
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
  ) {}

  async mint(
    userId: string,
    req: CreateShareRequest,
  ): Promise<{ shareId: string }> {
    const session = await this.sessions.getSession(req.sessionId);
    // Owner-scoped. A missing session and a non-owner are indistinguishable
    // to the caller — both 404 — so a share cannot probe for others' sessions.
    if (!session || session.userId !== userId) {
      throw new AppError("Clip not found", "SHARE_CLIP_NOT_FOUND", 404);
    }

    const versions = Array.isArray(session.prompt?.versions)
      ? session.prompt.versions
      : [];
    const version = versions.find((v) => v.versionId === req.promptVersionId);
    const generations = Array.isArray(version?.generations)
      ? version.generations
      : [];
    const generation = generations.find(
      (g) => typeof g.id === "string" && g.id === req.generationId,
    );
    if (!generation) {
      throw new AppError("Clip not found", "SHARE_CLIP_NOT_FOUND", 404);
    }

    const storagePath =
      typeof generation.storagePath === "string" ? generation.storagePath : "";
    if (!storagePath) {
      throw new AppError(
        "This clip has no shareable media yet",
        "SHARE_NO_MEDIA",
        400,
      );
    }

    const shareId = randomUUID();
    await this.store.save({
      shareId,
      storagePath,
      description: this.pickDescription(generation, version),
      model: typeof generation.model === "string" ? generation.model : null,
      createdAt: new Date().toISOString(),
    });
    return { shareId };
  }

  async resolve(shareId: string): Promise<PublicClipDto | null> {
    const record = await this.store.get(shareId);
    if (!record) return null;
    const { viewUrl } = await this.urls.getSharedViewUrl(record.storagePath);
    return {
      videoUrl: viewUrl,
      description: record.description,
      model: record.model,
      createdAt: record.createdAt,
    };
  }

  /** The clip's own prose, falling back to the version's words. */
  private pickDescription(
    generation: Record<string, unknown>,
    version: SessionPromptVersionEntry | undefined,
  ): string {
    if (typeof generation.prompt === "string" && generation.prompt.trim()) {
      return generation.prompt;
    }
    if (version && version.prompt.trim()) {
      return version.prompt;
    }
    return "";
  }
}
