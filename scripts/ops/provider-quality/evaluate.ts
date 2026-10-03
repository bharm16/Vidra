import assert from "node:assert/strict";
import Replicate from "replicate";
import { StudioModelRegistry } from "../../../server/src/services/studio/StudioModelRegistry";
import { ReplicateStudioImageRunner } from "../../../server/src/services/studio/providers/ReplicateStudioImageRunner";
import { ReplicateFluxSchnellProvider } from "../../../server/src/services/image-generation/providers/ReplicateFluxSchnellProvider";
import { ReplicateFluxKontextFastProvider } from "../../../server/src/services/image-generation/providers/ReplicateFluxKontextFastProvider";
import { IMAGE_PREVIEW_PROVIDER_IDS } from "../../../server/src/services/image-generation/providers/types";
import { generateReplicateVideo } from "../../../server/src/services/video-generation/providers/replicateProvider";
import { VIDEO_MODEL_PROVIDERS } from "../../../server/src/config/videoModelRegistry";
import type { VideoModelId } from "../../../shared/videoModels";
import type {
  StudioModelEntry,
  StudioUtilityOperation,
} from "../../../server/src/services/studio/types";
import { withOfflineProviderTransport, FIXTURE_OUTPUT_URL } from "./transport";
import type { OfflineProviderTransport } from "./transport";
import type { ProviderQualityReport, QualityPathResult } from "./types";

import { QUALITY_PROMPT, QUALITY_EDIT, QUALITY_SOURCE } from "./fixtures";
import { evaluateStudioRouting } from "./routing";
import { evaluateOtherVideoAdapters } from "./video";
import { evaluateSketchRelay } from "./sketch";
const TOKEN = "offline-quality-fixture-token";
const log = {
  info: (): void => {},
  warn: (): void => {},
  error: (): void => {},
};
const UTILITIES: readonly StudioUtilityOperation[] = [
  "remove_background",
  "vectorize",
];
const RATIOS = ["1:1", "16:9", "9:16", "invalid-ratio"] as const;

interface Probe {
  id: string;
  operation: QualityPathResult["operation"];
  model: string;
  configuration: Record<string, unknown>;
  assertions: string[];
  execute: () => Promise<unknown>;
  check: (transport: OfflineProviderTransport, output: unknown) => void;
}

function received(
  transport: OfflineProviderTransport,
  model: string,
): Record<string, unknown> {
  assert.equal(
    transport.unexpected.length,
    0,
    `no unexpected outbound requests: ${transport.unexpected.join(", ")}`,
  );
  assert.equal(transport.received.length, 1, "one provider submission");
  const request = transport.received[0];
  assert.ok(request);
  assert.equal(request.model, model, "exact provider model");
  return request.input;
}

function checkStudioInput(
  input: Record<string, unknown>,
  entry: StudioModelEntry,
  edit: boolean,
): void {
  assert.equal(
    input.prompt,
    edit ? QUALITY_EDIT : QUALITY_PROMPT,
    "exact instruction words",
  );
  for (const [key, value] of Object.entries(entry.pinnedInput ?? {})) {
    assert.equal(input[key], value, `pinned ${key}`);
  }
  if (entry.replicateId.startsWith("google/"))
    assert.equal(input.output_format, "png");
  if (edit)
    assert.deepEqual(
      input.image_input,
      [QUALITY_SOURCE],
      "unmodified source image",
    );
}

function studioProbes(
  registry: StudioModelRegistry,
  runner: ReplicateStudioImageRunner,
): Probe[] {
  const probes: Probe[] = [];
  for (const entry of registry.offerableModels()) {
    const timeoutMs = registry.timeoutMsFor(entry.slug);
    for (const requestedRatio of [
      ...new Set([...entry.aspectRatios, "invalid-ratio"]),
    ]) {
      const expectedRatio = entry.aspectRatios.includes(requestedRatio)
        ? requestedRatio
        : entry.defaultAspectRatio;
      probes.push({
        id: `studio/generate/${entry.slug}/${requestedRatio}`,
        operation: "generate",
        model: entry.replicateId,
        configuration: {
          pinnedModel: entry.slug,
          requestedRatio,
          expectedRatio,
          timeoutMs,
          pinnedInput: entry.pinnedInput ?? {},
        },
        assertions: [
          "exact pinned model at HTTP boundary",
          "aspect allowlist or documented default",
          "exact prompt and price-tier fields",
          "fixture output returned (no quality judgment)",
        ],
        execute: async (): Promise<unknown> =>
          runner.run({
            model: entry.replicateId,
            input: registry.buildGenerateInput(
              entry.slug,
              QUALITY_PROMPT,
              requestedRatio,
            ),
            userId: "quality-fixture",
            timeoutMs,
          }),
        check: (transport, output): void => {
          const input = received(transport, entry.replicateId);
          checkStudioInput(input, entry, false);
          assert.equal(input.aspect_ratio, expectedRatio);
          assert.ok(
            output &&
              typeof output === "object" &&
              "imageUrl" in output &&
              "durationMs" in output,
          );
          assert.equal(output.imageUrl, FIXTURE_OUTPUT_URL);
          assert.ok(
            typeof output.durationMs === "number" &&
              Number.isFinite(output.durationMs) &&
              output.durationMs >= 0,
          );
        },
      });
    }
    if (entry.capabilities.includes("edit")) {
      probes.push({
        id: `studio/edit/${entry.slug}`,
        operation: "edit",
        model: entry.replicateId,
        configuration: {
          pinnedModel: entry.slug,
          timeoutMs,
          pinnedInput: entry.pinnedInput ?? {},
        },
        assertions: [
          "exact pinned editor at HTTP boundary",
          "source URL and edit instruction preserved",
          "price-tier fields submitted",
        ],
        execute: async (): Promise<unknown> =>
          runner.run({
            model: entry.replicateId,
            input: registry.buildEditInput(entry.slug, QUALITY_EDIT, [
              QUALITY_SOURCE,
            ]),
            userId: "quality-fixture",
            timeoutMs,
          }),
        check: (transport): void =>
          checkStudioInput(received(transport, entry.replicateId), entry, true),
      });
    }
  }
  for (const operation of UTILITIES) {
    const entry = registry.getUtility(operation);
    const timeoutMs = registry.timeoutMsForUtility(operation);
    probes.push({
      id: `studio/transform/${operation}`,
      operation: "transform",
      model: entry.replicateId,
      configuration: { operation, timeoutMs },
      assertions: ["exact utility endpoint", "only source image submitted"],
      execute: async (): Promise<unknown> =>
        runner.run({
          model: entry.replicateId,
          input: registry.buildUtilityInput(operation, QUALITY_SOURCE),
          userId: "quality-fixture",
          timeoutMs,
        }),
      check: (transport): void =>
        assert.deepEqual(received(transport, entry.replicateId), {
          image: QUALITY_SOURCE,
        }),
    });
  }
  return probes;
}

function previewProbes(): Probe[] {
  const providers = [
    new ReplicateFluxSchnellProvider({ apiToken: TOKEN }),
    new ReplicateFluxKontextFastProvider({ apiToken: TOKEN }),
  ];
  assert.deepEqual(
    providers.map((provider) => provider.id),
    [...IMAGE_PREVIEW_PROVIDER_IDS],
    "all image providers covered",
  );
  return providers.flatMap((provider) =>
    RATIOS.map((ratio): Probe => {
      const edit = provider.id === "replicate-flux-kontext-fast";
      const model = edit
        ? "prunaai/flux-kontext-fast"
        : "black-forest-labs/flux-schnell";
      const expectedRatio =
        ratio === "invalid-ratio"
          ? edit
            ? "match_input_image"
            : "16:9"
          : ratio;
      return {
        id: `first-frame/${provider.id}/${ratio}`,
        operation: edit ? "edit" : "generate",
        model,
        configuration: {
          provider: provider.id,
          requestedRatio: ratio,
          expectedRatio,
          timeoutMs: 60_000,
          seed: 20261003,
          speedMode: "Juiced",
          outputQuality: 80,
        },
        assertions: [
          "exact provider endpoint",
          "aspect normalization",
          "prompt/output parameters",
          ...(edit ? ["source, seed and speed submitted"] : []),
        ],
        execute: async (): Promise<unknown> =>
          provider.generatePreview({
            prompt: edit ? QUALITY_EDIT : QUALITY_PROMPT,
            aspectRatio: ratio,
            userId: "quality-fixture",
            ...(edit
              ? {
                  inputImageUrl: QUALITY_SOURCE,
                  seed: 20261003,
                  speedMode: "Juiced" as const,
                }
              : {}),
          }),
        check: (transport): void => {
          const input = received(transport, model);
          assert.equal(input.prompt, edit ? QUALITY_EDIT : QUALITY_PROMPT);
          assert.equal(input.aspect_ratio, expectedRatio);
          assert.equal(input.output_format, "webp");
          assert.equal(input.output_quality, 80);
          if (edit) {
            assert.equal(input.img_cond_path, QUALITY_SOURCE);
            assert.equal(input.seed, 20261003);
            assert.equal(input.speed_mode, "Juiced 🔥 (default)");
          }
        },
      };
    }),
  );
}

function videoProbes(): Probe[] {
  const replicate = new Replicate({ auth: TOKEN });
  return (Object.entries(VIDEO_MODEL_PROVIDERS) as [VideoModelId, string][])
    .filter(([, provider]) => provider === "replicate")
    .flatMap(([model]) =>
      [false, true].flatMap((withFrame) =>
        ["16:9", "9:16", "1:1"].map((ratio): Probe => {
          const submittedModel = model.includes("wan")
            ? withFrame && model.includes("t2v")
              ? model.replace("t2v", "i2v")
              : !withFrame && model.includes("i2v")
                ? "wan-video/wan-2.2-t2v-fast"
                : model
            : model;
          return {
            id: `video/${model}/${withFrame ? "i2v" : "t2v"}/${ratio}`,
            operation: "motion",
            model: submittedModel,
            configuration: {
              requestedModel: model,
              aspectRatio: ratio,
              firstFrame: withFrame,
              seed: 20261003,
              seconds: "5",
              numFrames: 81,
              fps: 16,
              promptExtend: false,
              timeoutMs: null,
            },
            assertions: [
              "exact effective Wan model at HTTP boundary",
              "motion words preserved",
              "first frame forwarded",
              "seed and prompt expansion submitted",
              "size or duration parameters",
            ],
            execute: async (): Promise<unknown> =>
              generateReplicateVideo(
                replicate,
                QUALITY_PROMPT,
                model,
                {
                  aspectRatio: ratio as "16:9" | "9:16" | "1:1",
                  seed: 20261003,
                  seconds: "5",
                  numFrames: 81,
                  fps: 16,
                  promptExtend: false,
                  ...(withFrame ? { startImage: QUALITY_SOURCE } : {}),
                },
                log,
              ),
            check: (transport): void => {
              const input = received(transport, submittedModel);
              assert.equal(input.prompt, QUALITY_PROMPT);
              assert.equal(input.seed, 20261003);
              assert.equal(input.image, withFrame ? QUALITY_SOURCE : undefined);
              if (!submittedModel.includes("wan")) {
                assert.equal(input.aspect_ratio, ratio);
              } else if (submittedModel.includes("wan-2.5")) {
                assert.equal(input.duration, 5);
                assert.equal(input.enable_prompt_expansion, false);
              } else {
                assert.equal(input.num_frames, 81);
                assert.equal(input.frames_per_second, 16);
                assert.equal(input.prompt_extend, false);
                assert.equal(
                  input.size,
                  ratio === "9:16"
                    ? "720*1280"
                    : ratio === "1:1"
                      ? "1024*1024"
                      : "1280*720",
                );
              }
            },
          };
        }),
      ),
    );
}

/** Offline adapter contract evidence is deliberately separate from live creative quality. */
export async function evaluateProviderContracts(
  revision: string,
): Promise<ProviderQualityReport> {
  const startedAt = new Date().toISOString();
  const paths = await withOfflineProviderTransport(
    async (transport): Promise<QualityPathResult[]> => {
      const registry = new StudioModelRegistry();
      const runner = new ReplicateStudioImageRunner({ apiToken: TOKEN });
      const probes = [
        ...studioProbes(registry, runner),
        ...previewProbes(),
        ...videoProbes(),
      ];
      const results: QualityPathResult[] = [];
      for (const probe of probes) {
        transport.received.length = 0;
        transport.unexpected.length = 0;
        let reason: string | undefined;
        try {
          probe.check(transport, await probe.execute());
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
        results.push({
          id: probe.id,
          operation: probe.operation,
          model: probe.model,
          configuration: probe.configuration,
          contract: reason ? "failed" : "passed",
          assertions: probe.assertions,
          submitted: structuredClone(transport.received),
          ...(reason ? { reason } : {}),
          live: "not-verified",
          quality: "awaiting-owner-review",
        });
      }
      results.push(...(await evaluateStudioRouting(transport)));
      results.push(...(await evaluateOtherVideoAdapters(transport)));
      results.push(await evaluateSketchRelay(transport));
      return results;
    },
  );
  return {
    schema: "vidra-provider-quality/v1",
    mode: "offline-contract",
    revision,
    startedAt,
    finishedAt: new Date().toISOString(),
    verdict: paths.some((path) => path.contract === "failed")
      ? "contract-failed"
      : "contract-passed-quality-pending",
    taskSet: "creative-tasks/v1",
    paths,
    pending: [
      "#143 real HTTP clip acceptance",
      "Owner review of creative-tasks/v1 and actual outputs",
      "Live provider acceptance and output quality for every path",
      "Production timeout expiration: run canonical timeout/poll-resilience regression suites",
      "Canonical Luma ray3 currently dispatches ray-2; provider parity requires explicit resolution",
      "Replicate video run has no app-level timeout in its adapter; timeoutMs null records that gap",
    ],
  };
}
