import type {
  LiveStudioImageRunner,
  StudioImageCall,
  StudioImageCallResult,
  StudioImageRunner,
} from "@services/studio/providers/types";
import type { ReplayStudioImageRequest } from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { ReplayError } from "./errors";
import { studioImageRequestKey } from "./requestKey";
import { ReplaySeam, type ReplayMode } from "./ReplaySeam";

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
  private readonly inner: StudioImageRunner;

  constructor({
    mode,
    store,
    inner,
  }: {
    mode: ReplayMode;
    store: CassetteStore;
    inner: LiveStudioImageRunner;
  }) {
    this.inner = inner;
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
      live: () => this.inner.run(call),
      toRecorded: (result) => ({ ...result }),
    });
  }
}
