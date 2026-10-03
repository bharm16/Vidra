import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import Replicate from "replicate";
import type { CompletionArtifact } from "./completionEvidence";
import { verifyVideoArtifact } from "./completionEvidence";
import { COMPLETION_PROMPT } from "./completionPlan";
import { writeExclusiveEvidence } from "./completionLedger";

const responseRecord = z.record(z.string(), z.unknown());
const acceptedSchema = z.object({
  data: z.object({
    sessionId: z.string(),
    promptVersionId: z.string(),
    generationId: z.string(),
    imageUrl: z.string(),
  }),
});
const jobResponseSchema = z.object({ jobId: z.string() });

export interface WanHttpCompletionOptions {
  apiToken: string;
  directory: string;
  sourceDataUri: string;
  /** Test only: substitutes the process-external provider transport, not services. */
  providerFetch?: typeof fetch;
  /** Test only: real MP4 bytes served at the controlled provider output boundary. */
  providerOutputFixture?: Buffer;
}

/** One real HTTP intake/inline worker/Wan adapter path over controlled persistence. */
export async function completeWanViaHttp(
  options: WanHttpCompletionOptions,
): Promise<CompletionArtifact> {
  // These flags affect only this isolated proof process. No production config files change.
  const envChanges = {
    GCS_BUCKET_NAME:
      process.env.GCS_BUCKET_NAME ?? "prompt-builder-test-bucket",
    VIDEO_JOB_WORKER_ENABLED: "false",
    VIDEO_JOB_INLINE_ENABLED: "true",
    DEPTH_WARMUP_ON_STARTUP: "false",
    ENABLE_CONVERGENCE: "false",
  };
  const previous = new Map(
    Object.keys(envChanges).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(envChanges))
    process.env[key] = value;
  const { startCrossModeHarness, CROSS_MODE_API_KEY } = await import(
    "../../../tests/integration/helpers/cross-mode/harness"
  );
  const { BrowserVideoJobStore, BrowserVideoAssets, browserVideoProvider } =
    await import("../../../tests/e2e/cross-mode/controlledPorts");
  const { ReplicateVideoProvider } = await import(
    "../../../server/src/services/video-generation/providers/ReplicateVideoProvider"
  );
  const { VideoGenerationService } = await import(
    "../../../server/src/services/video-generation/VideoGenerationService"
  );
  const transcript: Record<string, unknown>[] = [];
  let selectedFrameBytes: Buffer | undefined;
  let dispatchError: Error | undefined;
  const harness = await startCrossModeHarness({
    replayMode: "record",
    async configureBoundaries({
      container,
      objects,
      idempotency,
    }): Promise<void> {
      if (options.providerOutputFixture)
        objects.put("provider/live-completion-fixture.mp4", {
          buffer: options.providerOutputFixture,
          contentType: "video/mp4",
        });
      const upstream = options.providerFetch ?? globalThis.fetch;
      const inlineOwnedSourceFetch: typeof fetch = async (
        input,
        init,
      ): Promise<Response> => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (
          request.method === "POST" &&
          url.origin === "https://api.replicate.com"
        ) {
          const body = responseRecord.parse(await request.clone().json());
          const params = responseRecord.parse(body.input);
          const source =
            typeof params.image === "string" ? params.image : undefined;
          const path = source ? objects.pathFromUrl(source) : null;
          const stored = path ? objects.get(path) : undefined;
          const inlineMatch = source
            ? /^data:([^;]+);base64,(.*)$/s.exec(source)
            : null;
          const bytes =
            stored?.buffer ??
            (inlineMatch?.[2]
              ? Buffer.from(inlineMatch[2], "base64")
              : undefined);
          if (
            !source ||
            !bytes ||
            !selectedFrameBytes ||
            !bytes.equals(selectedFrameBytes)
          ) {
            dispatchError = new Error(
              "Wan provider input does not contain the exact selected owned first-frame bytes",
            );
            throw dispatchError;
          }
          const digest = createHash("sha256").update(bytes).digest("hex");
          // Relocate the exact owned bytes solely at the external SDK transport.
          // The remote provider cannot fetch the controlled .invalid signed URL.
          params.image = stored
            ? `data:${stored.contentType};base64,${bytes.toString("base64")}`
            : source;
          transcript.push({
            sourceObjectPath: path,
            sourceSha256: digest,
            sourceBytes: bytes.length,
            prompt: params.prompt,
            model: "wan-video/wan-2.2-i2v-fast",
            sourceRelocation: stored
              ? "owned URL converted to identical inline bytes at provider transport"
              : "production SDK already inlined the exact selected owned bytes",
          });
          return upstream(request.url, {
            ...init,
            body: JSON.stringify({ ...body, input: params }),
          });
        }
        return upstream(input, init);
      };
      container.registerValue(
        "videoJobStore",
        new BrowserVideoJobStore(idempotency),
      );
      const assets = new BrowserVideoAssets(objects);
      container.registerValue("videoAssetStore", assets);
      container.registerValue(
        "videoGenerationService",
        new VideoGenerationService({
          providers: {
            replicate: new ReplicateVideoProvider({
              replicate: new Replicate({
                auth: options.apiToken,
                fetch: inlineOwnedSourceFetch,
              }),
            }),
            openai: browserVideoProvider("openai", Buffer.alloc(0), []),
            luma: browserVideoProvider("luma", Buffer.alloc(0), []),
            kling: browserVideoProvider("kling", Buffer.alloc(0), []),
            gemini: browserVideoProvider("gemini", Buffer.alloc(0), []),
          },
          assetStore: assets,
        }),
      );
    },
  });
  try {
    const accepted = await harness.post("/api/sketch/accept", {
      liveOutputDataUri: options.sourceDataUri,
      sketchSnapshotDataUri: options.sourceDataUri,
      inputs: {
        prompt: COMPLETION_PROMPT,
        strength: 0.6,
        steps: 8,
        seed: 20261003,
      },
      idempotencyKey: "live-provider-completion-source-20261003",
    });
    assert.ok(
      accepted.status >= 200 && accepted.status < 300,
      `Source admission answered${accepted.status}`,
    );
    const target = acceptedSchema.parse(accepted.json).data;
    const selectedFrameResponse = await fetch(target.imageUrl, {
      headers: { "x-api-key": CROSS_MODE_API_KEY },
    });
    assert.equal(selectedFrameResponse.status, 200);
    selectedFrameBytes = Buffer.from(await selectedFrameResponse.arrayBuffer());
    const payload = {
      prompt: COMPLETION_PROMPT,
      model: "wan-video/wan-2.2-i2v-fast",
      startImage: target.imageUrl,
      sourceGenerationId: target.generationId,
      sessionId: target.sessionId,
      promptVersionId: target.promptVersionId,
      aspectRatio: "1:1",
      numFrames: 81,
      fps: 16,
      seed: 20261003,
      promptExtend: false,
    };
    const response = await fetch(
      `${harness.baseUrl}/api/preview/video/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": CROSS_MODE_API_KEY,
          "Idempotency-Key": "live-provider-completion-wan-20261003",
        },
        body: JSON.stringify(payload),
      },
    );
    const receipt: unknown = await response.json();
    assert.equal(response.status, 202, "real free clip intake accepts request");
    const { jobId } = jobResponseSchema.parse(receipt);
    writeExclusiveEvidence(
      join(options.directory, "replicate.http-intake.json"),
      {
        route: "/api/preview/video/generate",
        payload: { ...payload, startImage: "controlled owned URL" },
        status: response.status,
        jobId,
        sourceId: target.generationId,
        sourceWords: COMPLETION_PROMPT,
      },
    );
    let status: Record<string, unknown> = {};
    const deadline = Date.now() + 420_000;
    while (Date.now() < deadline) {
      if (dispatchError) throw dispatchError;
      const polled = await harness.get(`/api/preview/video/jobs/${jobId}`);
      assert.equal(polled.status, 200);
      status = polled.json;
      if (status.status === "completed" || status.status === "failed") break;
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }
    assert.equal(
      status.status,
      "completed",
      "real inline worker completed the provider job",
    );
    const attachment = responseRecord.parse(status.attachment);
    assert.equal(
      attachment.state,
      "attached",
      "completed live clip reached its selected words-version",
    );
    assert.equal(transcript.length, 1, "one provider submission");
    assert.equal(
      transcript[0]?.prompt,
      COMPLETION_PROMPT,
      "intake words reached provider unchanged",
    );
    const reopened = await harness.get(`/api/sessions/${target.sessionId}`);
    assert.equal(reopened.status, 200);
    const session = await harness.sessions.get(target.sessionId);
    assert.ok(session);
    assert.ok(session.prompt);
    const versions = session.prompt.versions ?? [];
    const version = versions.find(
      (candidate) => candidate.versionId === target.promptVersionId,
    );
    assert.ok(version);
    const clip = version.generations?.find(
      (candidate) => candidate.id === jobId || candidate.videoUrl,
    );
    assert.ok(clip, "reopened words-version retains its completed clip");
    const url =
      typeof status.viewUrl === "string"
        ? status.viewUrl
        : typeof status.videoUrl === "string"
          ? status.videoUrl
          : undefined;
    assert.ok(url, "completed job exposes a download/view URL");
    const downloaded = await fetch(url);
    assert.equal(downloaded.status, 200);
    const path = join(options.directory, "replicate-output.mp4");
    await writeFile(path, Buffer.from(await downloaded.arrayBuffer()), {
      flag: "wx",
      mode: 0o600,
    });
    const artifact = await verifyVideoArtifact(path);
    writeExclusiveEvidence(
      join(options.directory, "replicate.http-completion.json"),
      {
        jobId,
        sessionId: target.sessionId,
        promptVersionId: target.promptVersionId,
        sourceGenerationId: target.generationId,
        attachment,
        reopenedThroughHttp: true,
        downloadedBytes: artifact.bytes,
        sha256: artifact.sha256,
        providerTranscript: transcript,
        controlledPersistence: true,
        browserPickerProof: "separate #141/#143",
      },
    );
    return artifact;
  } finally {
    await harness.close();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
