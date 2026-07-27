import type {
  ImagePreviewProvider,
  ImagePreviewProviderId,
  ImagePreviewRequest,
  ImagePreviewResult,
} from "@services/image-generation/providers/types";
import type { ReplayImagePreviewRequest } from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { ReplayError } from "./errors";
import { imagePreviewRequestKey } from "./requestKey";
import { ReplaySeam, type ReplayMode } from "./ReplaySeam";

/**
 * Record/replay seam at the image preview provider adapter.
 *
 * Identity-transparent: `id`, `displayName` and `requiresInputImage` are taken
 * from the wrapped provider, so the seam can stand in for ANY provider in the
 * registry (schnell, kontext, or a future addition) and registry selection and
 * fallback-order logic behave exactly as in live mode.
 *
 * In `record` mode it delegates to the real provider and captures each result;
 * in `replay` mode it serves recorded results with zero network (Replicate is
 * never touched, no API token required).
 */
export class RecordReplayImagePreviewProvider implements ImagePreviewProvider {
  readonly id: ImagePreviewProviderId;
  readonly displayName: string;
  readonly requiresInputImage: boolean;

  private readonly inner: ImagePreviewProvider;
  private readonly seam: ReplaySeam<"image-preview">;

  constructor({
    mode,
    store,
    inner,
  }: {
    mode: ReplayMode;
    store: CassetteStore;
    inner: ImagePreviewProvider;
  }) {
    this.id = inner.id;
    this.displayName = `${inner.displayName} (record/replay seam)`;
    this.requiresInputImage = inner.requiresInputImage ?? false;
    this.inner = inner;
    this.seam = new ReplaySeam({
      seam: "image-preview",
      mode,
      store,
      keyOf: imagePreviewRequestKey,
    });

    if (mode === "record" && !inner.isAvailable()) {
      throw new ReplayError(
        `RecordReplayImagePreviewProvider needs an available ${inner.id} ` +
          `provider to record (REPLICATE_API_TOKEN missing?)`,
      );
    }
  }

  isAvailable(): boolean {
    return this.seam.isReplaying ? true : this.inner.isAvailable();
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

    return this.seam.through({
      request: replayRequest,
      summary: `image preview (${this.id}) for prompt "${request.prompt.slice(0, 80)}"`,
      scenario: "image-preview",
      contract: "image-preview-result",
      live: () => this.inner.generatePreview(request),
      toRecorded: (result) => ({ ...result }),
    });
  }
}
