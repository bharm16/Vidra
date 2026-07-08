import type {
  ImagePreviewProvider,
  ImagePreviewRequest,
  ImagePreviewResult,
} from "@services/image-generation/providers/types";
import type { ReplayImagePreviewRequest } from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { validateEntryPayload } from "./contracts";
import { ReplayError } from "./errors";
import { imagePreviewRequestKey } from "./requestKey";
import type { ReplayMode } from "./RecordReplayAiService";

/**
 * Record/replay seam at the image preview provider adapter (Replicate Flux
 * Schnell). Presents the schnell provider id so registry selection and
 * fallback-order logic behave exactly as in live mode.
 *
 * In `record` mode it wraps the real provider and captures each result; in
 * `replay` mode it serves recorded results with zero network (Replicate is
 * never touched, no API token required).
 */
export class RecordReplayImagePreviewProvider implements ImagePreviewProvider {
  readonly id = "replicate-flux-schnell" as const;
  readonly displayName = "Flux Schnell (record/replay seam)";

  private readonly mode: ReplayMode;
  private readonly store: CassetteStore;
  private readonly inner: ImagePreviewProvider | null;

  constructor({
    mode,
    store,
    inner,
  }: {
    mode: ReplayMode;
    store: CassetteStore;
    inner?: ImagePreviewProvider;
  }) {
    this.mode = mode;
    this.store = store;
    this.inner = inner ?? null;
    if (mode === "record" && !this.inner) {
      throw new ReplayError(
        "RecordReplayImagePreviewProvider needs the real provider to record " +
          "(REPLICATE_API_TOKEN missing?)",
      );
    }
  }

  isAvailable(): boolean {
    return this.mode === "replay" ? true : (this.inner?.isAvailable() ?? false);
  }

  async generatePreview(
    request: ImagePreviewRequest,
  ): Promise<ImagePreviewResult> {
    // userId is identity, not content — excluded so fixtures replay for any user.
    const replayRequest: ReplayImagePreviewRequest = {
      prompt: request.prompt,
      aspectRatio: request.aspectRatio ?? null,
      inputImageUrl: request.inputImageUrl ?? null,
      seed: request.seed ?? null,
      speedMode: request.speedMode ?? null,
    };
    const key = imagePreviewRequestKey(replayRequest);

    if (this.mode === "replay") {
      const entry = this.store.lookupOrThrow(
        key,
        `image preview for prompt "${request.prompt.slice(0, 80)}"`,
      );
      if (entry.seam !== "image-preview") {
        throw new ReplayError(
          `Replay entry for key ${key} is not an image-preview recording`,
        );
      }
      validateEntryPayload(entry, {
        surface: "replay-lookup",
        scenario: "image-preview",
      });
      return structuredClone(entry.response) as ImagePreviewResult;
    }

    if (!this.inner) {
      throw new ReplayError("Record mode requires the real image provider");
    }
    const result = await this.inner.generatePreview(request);
    this.store.record({
      seam: "image-preview",
      key,
      contract: "image-preview-result",
      request: replayRequest,
      response: { ...result },
    });
    return result;
  }
}
