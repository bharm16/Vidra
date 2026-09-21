import type {
  LiveStudioImageRunner,
  StudioImageCall,
  StudioImageCallResult,
  StudioImageRunner,
} from "@services/studio/providers/types";
import {
  REPLAY_CASSETTE_FORMAT_VERSION,
  type ReplayCaptureProvenance,
  type ReplayStudioImageRequest,
} from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { ReplayError } from "./errors";
import { studioImageRequestKey } from "./requestKey";
import { ReplaySeam, type ReplayMode } from "./ReplaySeam";
import { fetchAsDataUri, type MediaFetcher } from "./replayableMedia";

/**
 * Record/replay seam at the studio image runner.
 *
 * Studio's decision (`studio_turn`) already records through the aiService
 * seam; without this the image run — the part that spends money and produces
 * the artifact — still reached Replicate live.
 *
 * Implements the runner seam rather than subclassing the Replicate runner:
 * it delegates every call to `inner`, so inheriting an implementation it
 * never uses only made the fake depend on the vendor it exists to replace.
 */
export class RecordReplayStudioImageRunner implements StudioImageRunner {
  private readonly seam: ReplaySeam<"studio-image">;
  private readonly inner: LiveStudioImageRunner;
  private readonly fetchImage: MediaFetcher;

  constructor({
    mode,
    store,
    inner,
    fetchImage = fetch,
  }: {
    mode: ReplayMode;
    store: CassetteStore;
    inner: LiveStudioImageRunner;
    /** Downloads a produced image at capture time. Only used in record mode. */
    fetchImage?: MediaFetcher;
  }) {
    this.inner = inner;
    this.fetchImage = fetchImage;
    this.seam = new ReplaySeam({
      seam: "studio-image",
      mode,
      store,
      keyOf: studioImageRequestKey,
    });

    if (mode === "record" && !inner.isAvailable()) {
      throw new ReplayError(
        "RecordReplayStudioImageRunner needs an available Replicate runner " +
          "to record (REPLICATE_API_TOKEN missing?)",
      );
    }
  }

  async run(call: StudioImageCall): Promise<StudioImageCallResult> {
    // userId is identity and timeoutMs is tuning — neither changes what was
    // asked of the model, so both stay out of the recorded request.
    const request: ReplayStudioImageRequest = {
      model: call.model,
      input: call.input,
    };

    return this.seam.through({
      request,
      summary: `studio image run on model "${call.model}"`,
      scenario: "studio-image",
      contract: "studio-image-result",
      live: async () => {
        const result = await this.inner.run(call);
        // A live capture must replay offline: the provider answers with a CDN
        // URL whose bytes are not durable, so the capture inlines them. The
        // caller (StudioService) saves those same bytes, which also keeps the
        // walkthrough's content-addressed storage paths consistent between
        // the record run and every replay of the pack.
        return {
          ...result,
          imageUrl: await fetchAsDataUri(result.imageUrl, this.fetchImage),
        };
      },
      toRecorded: (result) => ({ ...result }),
      provenance: this.seam.isReplaying
        ? undefined
        : this.provenanceFor(call),
    });
  }

  /** Capture provenance: the registry-chosen model and the call's budget. */
  private provenanceFor(call: StudioImageCall): ReplayCaptureProvenance {
    return {
      operation: "studio_image_run",
      // This seam wraps the Replicate runner by construction — the record
      // path refuses any other inner (see the constructor above).
      provider: "replicate",
      model: call.model,
      parameters: {
        timeoutMs: call.timeoutMs,
      },
      origin: "live",
      capture: {
        replayMode: "record",
        recordedAt: new Date().toISOString(),
        formatVersion: REPLAY_CASSETTE_FORMAT_VERSION,
      },
    };
  }
}
