import assert from "node:assert/strict";
import OpenAI from "openai";
import { LumaAI } from "lumaai";
import { generateSoraVideo } from "../../../server/src/services/video-generation/providers/soraProvider";
import {
  generateKlingVideo,
  DEFAULT_KLING_BASE_URL,
} from "../../../server/src/services/video-generation/providers/klingProvider";
import { generateLumaVideo } from "../../../server/src/services/video-generation/providers/lumaProvider";
import {
  generateVeoVideo,
  DEFAULT_VEO_BASE_URL,
} from "../../../server/src/services/video-generation/providers/veoProvider";
import { getProviderPollTimeoutMs } from "../../../server/src/services/video-generation/providers/timeoutPolicy";
import { VIDEO_MODEL_PROVIDERS } from "../../../server/src/config/videoModelRegistry";
import type { SoraModelId, KlingModelId } from "../../../shared/videoModels";
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

/** Every non-Replicate callable generation model, through its real SDK/HTTP adapter. */
export async function evaluateOtherVideoAdapters(
  transport: OfflineProviderTransport,
): Promise<QualityPathResult[]> {
  const openai = new OpenAI({
    apiKey: "offline-quality-fixture-token",
    fetch: transport.fetch,
    maxRetries: 0,
  });
  const luma = new LumaAI({
    authToken: "offline-quality-fixture-token",
    fetch: transport.fetch,
    maxRetries: 0,
  });
  const results: QualityPathResult[] = [];
  for (const [requestedModel, provider] of Object.entries(
    VIDEO_MODEL_PROVIDERS,
  )) {
    if (provider === "replicate") continue;
    for (const withFrame of [false, true]) {
      for (const ratio of ["16:9", "9:16", "1:1"] as const) {
        transport.received.length = 0;
        transport.unexpected.length = 0;
        const effectiveModel: string =
          provider === "luma"
            ? "ray-2"
            : provider === "gemini"
              ? "veo-3.1-generate-preview"
              : requestedModel;
        const options = {
          aspectRatio: ratio,
          seconds: "8" as const,
          seed: 20261003,
          ...(withFrame ? { startImage: QUALITY_SOURCE } : {}),
        };
        let reason: string | undefined;
        let diagnosticCode: QualityPathResult["diagnosticCode"];
        try {
          if (provider === "openai")
            await generateSoraVideo(
              openai,
              QUALITY_PROMPT,
              requestedModel as SoraModelId,
              options,
              store,
              log,
            );
          else if (provider === "luma")
            await generateLumaVideo(luma, QUALITY_PROMPT, options, log);
          else if (provider === "kling")
            await generateKlingVideo(
              "offline-quality-fixture-token",
              DEFAULT_KLING_BASE_URL,
              QUALITY_PROMPT,
              requestedModel as KlingModelId,
              { ...options, seconds: "5" },
              log,
            );
          else
            await generateVeoVideo(
              "offline-quality-fixture-token",
              DEFAULT_VEO_BASE_URL,
              QUALITY_PROMPT,
              options,
              store,
              log,
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
            const expectedParameters = {
              aspectRatio: ratio,
              seed: 20261003,
              durationSeconds: 8,
            };
            assert.deepEqual(input.parameters, expectedParameters);
            const instances = input.instances as Record<string, unknown>[];
            assert.equal(instances[0]?.prompt, QUALITY_PROMPT);
            assert.equal(Boolean(instances[0]?.image), withFrame);
          } else {
            assert.equal(input.prompt, QUALITY_PROMPT);
            if (provider === "openai") {
              assert.equal(input.seconds, "8");
              assert.equal(
                input.size,
                ratio === "9:16" ? "720x1280" : "1280x720",
              );
              assert.equal(Boolean(input.input_reference), withFrame);
            } else {
              assert.equal(input.aspect_ratio, ratio);
              if (provider === "luma")
                assert.deepEqual(
                  input.keyframes,
                  withFrame
                    ? { frame0: { type: "image", url: QUALITY_SOURCE } }
                    : undefined,
                );
              else
                assert.equal(
                  input.image,
                  withFrame ? QUALITY_SOURCE : undefined,
                );
            }
          }
          if (provider === "luma" && requestedModel === "luma-ray3")
            diagnosticCode = "luma-model-mismatch";
          if (diagnosticCode)
            throw new Error(
              "Provider model mismatch: registry offers luma-ray3 but the real adapter submitted ray-2. Contract review and live quality acceptance remain open.",
            );
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
            seconds: provider === "kling" ? "5" : "8",
            seedRequested: 20261003,
            ...(provider === "luma"
              ? {
                  compatibilityWarning:
                    "Canonical luma-ray3 currently submits ray-2; parity/quality acceptance pending.",
                }
              : {}),
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
          ...(diagnosticCode ? { diagnosticCode } : {}),
          live: "not-verified",
          quality: "awaiting-owner-review",
        });
      }
    }
  }
  return results;
}
