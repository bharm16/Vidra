import {
  ReplicateStudioImageRunner,
  type StudioImageCall,
  type StudioImageCallResult,
} from "@services/studio/providers/ReplicateStudioImageRunner";
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
 * Subclasses the concrete runner because `StudioService` types its `runner`
 * dependency as the class, not an interface. Every public method of the base
 * is overridden here; widening `StudioService` to accept an interface would
 * remove the need for the subclass (owner: the studio module).
 */
export class RecordReplayStudioImageRunner extends ReplicateStudioImageRunner {
  private readonly seam: ReplaySeam<"studio-image">;
  private readonly inner: ReplicateStudioImageRunner;

  constructor({
    mode,
    store,
    inner,
  }: {
    mode: ReplayMode;
    store: CassetteStore;
    inner: ReplicateStudioImageRunner;
  }) {
    super({});
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

  override isAvailable(): boolean {
    return this.seam.isReplaying ? true : this.inner.isAvailable();
  }

  override async run(call: StudioImageCall): Promise<StudioImageCallResult> {
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
