import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import { logger } from "@infrastructure/Logger";
import type { OwnedPictureResolver } from "@services/owned-media";
import type {
  SessionDto,
  SessionGenerationRecord,
} from "@shared/types/session";

/**
 * Re-mint a session's picture view URLs on READ — issue #125.
 *
 * A session record persists the signed URLs a take was made with, and those
 * signatures die in an hour (`signedUrlPolicy` → `view`). Reopen the session
 * after that and every picture is an apparently-missing image, even though the
 * bytes are exactly where they were left. This freshens the read: for each
 * picture take that records a durable handle (a storage path or an asset id),
 * it mints a fresh view URL through the ONE owner-checked resolver that
 * understands both stores (issue #109) and stamps the URL's expiry onto the
 * record.
 *
 * It reads the OWNER off the DTO (`dto.userId`) rather than trusting a caller,
 * mirroring the studio-refine bridge: the resolver rebuilds the object's path
 * from that uid and refuses anything outside it, so a re-mint can never address
 * another creator's object. A refusal (`null`) leaves the stored URL untouched
 * — absence reads as absence, and the client still carries the durable handle
 * to recover from.
 *
 * Nothing here writes to storage: it is a read-time transform over the DTO, so
 * the persisted record keeps its own URLs and each read mints afresh. Clips and
 * storyboards are left alone — the resolver is a picture resolver, and "shows
 * every picture" is the promise being kept.
 */

const log = logger.child({ service: "remintSessionPictureUrls" });

export interface RemintSessionPicturesDeps {
  resolver: OwnedPictureResolver;
  /** Injectable clock so the stamped expiry is assertable in tests. */
  now?: () => number;
}

const readString = (
  record: Record<string, unknown>,
  field: string,
): string | undefined => {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * The take's durable handle straight from the record — the same shape the
 * studio bridge reads: a storage path outright, or the first of `mediaAssetIds`.
 */
const readHandle = (
  record: Record<string, unknown>,
): { storagePath?: string | undefined; assetId?: string | undefined } => {
  const assetIds = record.mediaAssetIds;
  const assetId = Array.isArray(assetIds)
    ? assetIds.find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.length > 0,
      )
    : undefined;
  return { storagePath: readString(record, "storagePath"), assetId };
};

const remintPicture = async (
  gen: SessionGenerationRecord,
  ownerId: string,
  resolver: OwnedPictureResolver,
  viewUrlExpiresAt: string,
): Promise<SessionGenerationRecord> => {
  const record = gen as Record<string, unknown>;
  // Pictures only; a clip's poster and a storyboard are not this resolver's.
  if (record.mediaType !== "image") return gen;

  const handle = readHandle(record);
  if (!handle.storagePath && !handle.assetId) return gen;

  // A single picture's mint must never fail the whole session read: a store
  // hiccup degrades to the stored URL (which the client can still recover from
  // its durable handle), never a 500 on reopen.
  let resolved;
  try {
    resolved = await resolver.resolveOwnedPicture(ownerId, handle);
  } catch (error) {
    log.warn("Session read kept a stored picture URL: re-mint threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return gen;
  }
  if (!resolved) return gen;

  // A picture is one object; its `mediaUrls[0]` and `thumbnailUrl` are both
  // signed URLs to it, so both become the freshly minted URL. Extra media
  // entries (there are none for a picture today) ride through untouched.
  const mediaUrls = Array.isArray(record.mediaUrls)
    ? [resolved.viewUrl, ...record.mediaUrls.slice(1)]
    : [resolved.viewUrl];

  const next: Record<string, unknown> = {
    ...record,
    mediaUrls,
    viewUrlExpiresAt,
  };
  if (readString(record, "thumbnailUrl")) {
    next.thumbnailUrl = resolved.viewUrl;
  }
  return next as SessionGenerationRecord;
};

export async function remintSessionPictureUrls(
  dto: SessionDto,
  deps: RemintSessionPicturesDeps,
): Promise<SessionDto> {
  const prompt = dto.prompt;
  const versions = prompt?.versions;
  if (!prompt || !versions || versions.length === 0) return dto;

  const viewUrlExpiresAt = new Date(
    (deps.now?.() ?? Date.now()) + SIGNED_URL_TTL_MS.view,
  ).toISOString();

  let changed = false;
  const nextVersions = await Promise.all(
    versions.map(async (version) => {
      const generations = version.generations;
      if (!generations || generations.length === 0) return version;

      let versionChanged = false;
      const nextGenerations = await Promise.all(
        generations.map(async (gen) => {
          const reminted = await remintPicture(
            gen,
            dto.userId,
            deps.resolver,
            viewUrlExpiresAt,
          );
          if (reminted !== gen) versionChanged = true;
          return reminted;
        }),
      );

      if (!versionChanged) return version;
      changed = true;
      return { ...version, generations: nextGenerations };
    }),
  );

  if (!changed) return dto;
  return { ...dto, prompt: { ...prompt, versions: nextVersions } };
}
