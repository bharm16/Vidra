import assert from "node:assert/strict";
import {
  generateVeoVideo,
  DEFAULT_VEO_BASE_URL,
} from "../../../server/src/services/video-generation/providers/veoProvider";
import { getProviderPollTimeoutMs } from "../../../server/src/services/video-generation/providers/timeoutPolicy";
import { VIDEO_MODEL_PROVIDERS } from "../../../server/src/config/videoModelRegistry";
import { isReleaseGenerationModelSupported } from "../../../shared/videoModels";
import type {
  VideoAssetStore,
  StoredVideoAsset,
} from "../../../server/src/services/video-generation/storage/types";
import type { OfflineProviderTransport } from "./transport";
import type { QualityPathResult } from "./types";
import { QUALITY_PROMPT, QUALITY_SOURCE } from "./fixtures";

const log = {
  debug: (): void => {},
  info: (): void => {},
  warn: (): void => {},
};
const asset: StoredVideoAsset = {
  id: "quality-fixture",
  url: "https://fixtures.invalid/provider-quality/output.mp4",
  contentType: "video/mp4",
  createdAt: 0,
};
const store: VideoAssetStore = {
  storeFromBuffer: async (): Promise<StoredVideoAsset> => asset,
  storeFromStream: async (stream): Promise<StoredVideoAsset> => {
    for await (const _chunk of stream) {
      /* drain controlled bytes */
    }
    return asset;
  },
  getStream: async (): Promise<null> => null,
  getPublicUrl: async (): Promise<string> => asset.url,
  cleanupExpired: async (): Promise<number> => 0,
};

/** Current supported non-Replicate paths; excluded historical IDs are inventory only. */
export async function evaluateOtherVideoAdapters(
  transport: OfflineProviderTransport,
): Promise<QualityPathResult[]> {
  const results: QualityPathResult[] = [];
  for (const [requestedModel, provider] of Object.entries(
    VIDEO_MODEL_PROVIDERS,
  )) {
    if (!isReleaseGenerationModelSupported(requestedModel)) {
      results.push({
        id: `video/${requestedModel}/release-excluded`,
        operation: "motion",
        model: requestedModel,
        configuration: { provider, releaseSupport: "excluded" },
        contract: "not-run",
        assertions: [],
        submitted: [],
        reason:
          provider === "kling"
            ? "Owner excluded Kling from the supported release and its evaluation."
            : provider === "openai"
              ? "Sora 2 and Videos API were shut down by OpenAI on 2026-09-24; no video request is dispatched. OpenAI text completion remains a separate active integration."
              : "Luma deferred: installed legacy adapter does not serve the declared model; Ray 3.2 requires a qualified new-API migration.",
        live: "not-verified",
        quality: "not-evaluated",
      });
      continue;
    }
    if (provider === "replicate") continue;
    for (const withFrame of [false, true]) {
      for (const ratio of ["16:9", "9:16", "1:1"] as const) {
        transport.received.length = 0;
        transport.unexpected.length = 0;
        const effectiveModel: string =
          provider === "gemini" ? "veo-3.1-generate-preview" : requestedModel;
        const options = {
          aspectRatio: ratio,
          seconds: "8" as const,
          seed: 20261003,
          ...(withFrame ? { startImage: QUALITY_SOURCE } : {}),
        };
        let reason: string | undefined;
        try {
          if (provider === "gemini")
            await generateVeoVideo(
              "offline-quality-fixture-token",
              DEFAULT_VEO_BASE_URL,
              QUALITY_PROMPT,
              options,
              store,
              log,
            );
          else
            throw new Error(
              `No offline provider-quality adapter capture for supported provider: ${provider}`,
            );
          assert.equal(
            transport.unexpected.length,
            0,
            transport.unexpected.join(", "),
          );
          assert.equal(transport.received.length, 1);
          const received = transport.received[0];
          assert.ok(received);
          assert.equal(received.model, effectiveModel);
          const input = received.input;
          if (provider === "gemini") {
            assert.deepEqual(input.parameters, {
              aspectRatio: ratio,
              seed: 20261003,
              durationSeconds: 8,
            });
            const instances = input.instances as Record<string, unknown>[];
            assert.equal(instances[0]?.prompt, QUALITY_PROMPT);
            assert.equal(Boolean(instances[0]?.image), withFrame);
          } else {
            assert.equal(input.prompt, QUALITY_PROMPT);
            assert.equal(input.seconds, "8");
            assert.equal(
              input.size,
              ratio === "9:16" ? "720x1280" : "1280x720",
            );
            assert.equal(Boolean(input.input_reference), withFrame);
          }
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
        results.push({
          id: `video/${requestedModel}/${withFrame ? "i2v" : "t2v"}/${ratio}`,
          operation: "motion",
          model: effectiveModel,
          configuration: {
            requestedModel,
            effectiveModel,
            provider,
            requestedRatio: ratio,
            withFrame,
            timeoutMs: getProviderPollTimeoutMs(),
            seconds: "8",
            seedRequested: 20261003,
          },
          contract: reason ? "failed" : "passed",
          assertions: [
            "effective model recorded and captured at provider HTTP boundary",
            "motion prompt preserved",
            "documented aspect normalization",
            "source frame and supported duration fields",
          ],
          submitted: structuredClone(transport.received),
          ...(reason ? { reason } : {}),
          live: "not-verified",
          quality: "not-evaluated",
        });
      }
    }
  }
  return results;
}
