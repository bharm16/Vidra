import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { AIModelService } from "@services/ai-model/AIModelService";
import type {
  ExecuteParams,
  StreamParams,
  RoutedAIResponse,
  ResolvedExecution,
} from "@services/ai-model/types";
import type { OperationName } from "@config/modelConfig";
import type { VideoJobStore } from "@services/video-generation/runtime/VideoJobStore";
import type { VideoJobRecord } from "@services/video-generation/runtime/types";
import type {
  VideoAssetStore,
  StoredVideoAsset,
  VideoAssetStream,
} from "@services/video-generation/storage/types";
import type {
  VideoProvider,
  VideoProviderId,
} from "@services/video-generation/providers/types";
import type { StudioImageRunner } from "@services/studio/providers/types";
import {
  InMemoryVideoJobStore,
  type InMemoryObjectStore,
  type InMemoryIdempotencyService,
} from "#tests/integration/helpers/cross-mode/boundaryDoubles";

/** Typed synthetic provider decisions; no route, admission or session rule lives here. */
export class BrowserAIProvider extends AIModelService {
  constructor() {
    super({ clients: { openai: null } });
  }

  override resolveExecution(): ResolvedExecution {
    return {
      client: "openai",
      provider: "openai",
      model: "synthetic-browser-fixture",
      viaFallback: false,
    };
  }

  override supportsStreaming(): boolean {
    return true;
  }

  private response(operation: OperationName, params: ExecuteParams): string {
    if (operation === "studio_turn") {
      const inventory = params.userMessage ?? "";
      const source = /- ([^\s]+) —/.exec(inventory)?.[1];
      if (!source)
        throw new Error(
          "The browser's bridge supplied no image to the studio decision",
        );
      return JSON.stringify({
        action: "edit",
        thinking: "I will remove the reflection while preserving the scene.",
        instruction: "take the reflection out",
        sourceImageIds: [source],
        suggestions: ["Warm the light", "More contrast", "Make the boat blue"],
      });
    }
    if (operation === "span_labeling")
      return JSON.stringify({
        analysis_trace: "Synthetic empty-label boundary",
        isAdversarial: false,
        spans: [],
        meta: { version: "synthetic", notes: "No labels needed for this path" },
      });
    throw new Error(`Unscripted provider operation: ${operation}`);
  }

  override async execute(
    operation: OperationName,
    params: ExecuteParams,
  ): Promise<RoutedAIResponse> {
    return {
      text: this.response(operation, params),
      metadata: {},
      executedBy: this.resolveExecution(),
    };
  }

  override async stream(
    operation: OperationName,
    params: StreamParams,
  ): Promise<string> {
    const text = this.response(operation, params as ExecuteParams);
    params.onChunk(text);
    return text;
  }
}

/** Extends the conformance-tested job store only with the actual intake/claim port. */
export class BrowserVideoJobStore extends InMemoryVideoJobStore {
  constructor(private readonly idempotency: InMemoryIdempotencyService) {
    super();
  }

  async createJobWithReceipt(
    input: Parameters<VideoJobStore["createJobWithReceipt"]>[0],
    deps: Parameters<VideoJobStore["createJobWithReceipt"]>[1],
  ): ReturnType<VideoJobStore["createJobWithReceipt"]> {
    if (input.creditsReserved !== 0)
      throw new Error("Free browser intake reserved credits");
    const now = Date.now();
    const job: VideoJobRecord = {
      ...input,
      id: randomUUID(),
      schemaVersion: 1,
      status: "queued",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      createdAtMs: now,
      updatedAtMs: now,
    };
    const snapshot = deps.buildSnapshot(job);
    // Publish the receipt first; the job cannot be observed or claimed before it.
    // Real Firestore atomicity is covered by #124's separate transaction tests.
    await this.idempotency.markCompleted({ recordId: deps.recordId, snapshot });
    this.seed(job);
    return { job, snapshot };
  }

  async claimJob(
    id: string,
    workerId: string,
    leaseMs: number,
  ): Promise<VideoJobRecord | null> {
    const job = await this.getJob(id);
    if (!job || job.status !== "queued") return null;
    const claimed = {
      ...job,
      status: "processing" as const,
      workerId,
      leaseExpiresAtMs: Date.now() + leaseMs,
    };
    this.seed(claimed);
    return claimed;
  }
}

export class BrowserVideoAssets implements VideoAssetStore {
  constructor(private readonly objects: InMemoryObjectStore) {}

  async storeFromBuffer(
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredVideoAsset> {
    const id = randomUUID();
    const path = `provider/${id}.mp4`;
    this.objects.put(path, { buffer, contentType });
    return {
      id,
      url: this.objects.urlFor(path),
      contentType,
      createdAt: Date.now(),
      sizeBytes: buffer.length,
    };
  }

  async storeFromStream(
    stream: NodeJS.ReadableStream,
    contentType: string,
  ): Promise<StoredVideoAsset> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable)
      chunks.push(Buffer.from(chunk as Uint8Array));
    return this.storeFromBuffer(Buffer.concat(chunks), contentType);
  }

  async getStream(): Promise<VideoAssetStream | null> {
    return null;
  }
  async getPublicUrl(): Promise<string | null> {
    return null;
  }
  async cleanupExpired(): Promise<number> {
    return 0;
  }
}

export function browserVideoProvider(
  id: VideoProviderId,
  clip: Buffer,
  calls: Array<Record<string, unknown>>,
): VideoProvider {
  return {
    id,
    displayName: "Synthetic browser fixture",
    requiredKey: "NONE",
    // This walkthrough explicitly chooses Veo. Every other provider is unavailable.
    isAvailable: (): boolean => id === "gemini",
    async generate(
      prompt,
      model,
      options,
      assetStore,
    ): Promise<{ asset: StoredVideoAsset }> {
      if (id !== "gemini" || model !== "google/veo-3")
        throw new Error(`Unscripted provider/model: ${id}/${model}`);
      calls.push({ prompt, model, options: structuredClone(options) });
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      return { asset: await assetStore.storeFromBuffer(clip, "video/mp4") };
    },
  };
}

export function browserStudioRunner(
  objects: InMemoryObjectStore,
  frame: Buffer,
): StudioImageRunner {
  return {
    async run(): Promise<{ imageUrl: string; durationMs: number }> {
      const path = `provider/${randomUUID()}.png`;
      objects.put(path, { buffer: frame, contentType: "image/png" });
      return { imageUrl: objects.urlFor(path), durationMs: 1 };
    },
  };
}
