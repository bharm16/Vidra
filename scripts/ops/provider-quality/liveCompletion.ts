import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { AIModelService } from "../../../server/src/services/ai-model/AIModelService";
import { LLMClient } from "../../../server/src/clients/LLMClient";
import { OpenAICompatibleAdapter } from "../../../server/src/clients/adapters/OpenAICompatibleAdapter";
import { ModelConfig } from "../../../server/src/config/modelConfig";
import { resolveFalApiKey } from "../../../server/src/utils/falApiKey";
import {
  generateVeoVideo,
  DEFAULT_VEO_BASE_URL,
} from "../../../server/src/services/video-generation/providers/veoProvider";
import {
  localCompletionVideoStore,
  saveImageArtifact,
  verifyVideoArtifact,
  type CompletionArtifact,
} from "./completionEvidence";
import { CompletionLedger, writeExclusiveEvidence } from "./completionLedger";
import {
  COMPLETION_PROMPT,
  COMPLETION_TEXT_PROMPT,
  type CompletionPlan,
  type CompletionProvider,
} from "./completionPlan";
import { tinyPngDataUri } from "../live-provider-smoke/tinyPng";
import { completeWanViaHttp } from "./wanHttpCompletion";

export interface LiveCompletionResult {
  provider: CompletionProvider;
  model: string;
  status: "completed" | "failed" | "not-verified";
  quality: "not-evaluated";
  seam:
    | "production-adapter"
    | "aiService-text"
    | "fal-http"
    | "free-http-intake";
  reserveCents: number;
  pricingSource: string;
  configuration: Record<string, unknown>;
  elapsedMs: number;
  reason?: string;
  artifact?: CompletionArtifact;
  reusedEvidence?: boolean;
}

export interface CompletionCredentials {
  fal: string | undefined;
  replicate: string | undefined;
  google: string | undefined;
  "openai-text": string | undefined;
}

export function loadCompletionCredentials(): CompletionCredentials {
  return {
    fal: resolveFalApiKey() ?? undefined,
    replicate: process.env.REPLICATE_API_TOKEN,
    google: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    "openai-text": process.env.OPENAI_API_KEY,
  };
}

const resultSchema = z.object({
  provider: z.enum(["fal", "replicate", "google", "openai-text"]),
  model: z.string(),
  status: z.enum(["completed", "failed", "not-verified"]),
  quality: z.literal("not-evaluated"),
  seam: z.enum([
    "production-adapter",
    "aiService-text",
    "fal-http",
    "free-http-intake",
  ]),
  reserveCents: z.number(),
  pricingSource: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  elapsedMs: z.number(),
  reason: z.string().optional(),
  artifact: z
    .object({
      path: z.string(),
      sha256: z.string(),
      bytes: z.number(),
      kind: z.enum(["video", "image", "text"]),
      verification: z.record(z.string(), z.unknown()),
    })
    .optional(),
});
const inputRecord = z.record(z.string(), z.unknown());
const log = {
  info: (): void => {},
  warn: (): void => {},
  error: (): void => {},
};

export function redactCompletionEvidence(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:"))
      return {
        type: "data-uri",
        bytes: value.length,
        sha256: createHash("sha256").update(value).digest("hex"),
      };
    if (/^https?:/.test(value)) {
      const url = new URL(value);
      return `${url.origin}${url.pathname}${url.search ? "?[redacted]" : ""}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactCompletionEvidence);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        redactCompletionEvidence(child),
      ]),
    );
  return value;
}

function errorSummary(
  error: unknown,
  credentials: CompletionCredentials,
): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of Object.values(credentials))
    if (key) message = message.split(key).join("[credential-redacted]");
  return message
    .replace(/https?:\/\/[^\s"']+/g, (url) =>
      String(redactCompletionEvidence(url)),
    )
    .slice(0, 1500);
}

/** Only one billable POST can cross the external boundary, including SDK retries. */
export function completionFetchGuard(
  plan: CompletionPlan,
  ledger: CompletionLedger,
  originalFetch: typeof fetch,
): typeof fetch {
  return async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "POST" && url.hostname === "127.0.0.1")
      return originalFetch(input, init);
    if (request.method === "POST") {
      const approved =
        plan.provider === "fal"
          ? url.origin === "https://fal.run" &&
            url.pathname === "/fal-ai/z-image/turbo/image-to-image"
          : plan.provider === "replicate"
            ? url.origin === "https://api.replicate.com" &&
              url.pathname ===
                "/v1/models/wan-video/wan-2.2-i2v-fast/predictions"
            : plan.provider === "google"
              ? url.origin === "https://generativelanguage.googleapis.com" &&
                url.pathname ===
                  "/v1beta/models/veo-3.1-generate-preview:predictLongRunning"
              : url.origin === "https://api.openai.com" &&
                url.pathname === "/v1/chat/completions";
      if (!approved)
        throw new Error(
          `Unallocated paid endpoint refused for ${plan.provider}`,
        );
      const body = inputRecord.parse(await request.clone().json());
      if (plan.provider === "google") {
        const parameters = inputRecord.parse(body.parameters);
        if (
          parameters.durationSeconds !== 4 ||
          parameters.resolution !== "720p" ||
          parameters.aspectRatio !== "16:9" ||
          !Array.isArray(body.instances) ||
          body.instances.length !== 1
        )
          throw new Error(
            "Google request exceeded its declared parameter/cost bound",
          );
      } else if (plan.provider === "replicate") {
        const params = inputRecord.parse(body.input);
        if (
          params.num_frames !== 81 ||
          params.frames_per_second !== 16 ||
          params.interpolate_output === true ||
          (params.resolution !== undefined &&
            params.resolution !== "480p" &&
            params.resolution !== "720p")
        )
          throw new Error(
            "Replicate request exceeded its declared parameter/cost bound",
          );
      } else if (plan.provider === "fal") {
        if (body.num_images !== undefined && body.num_images !== 1)
          throw new Error("fal completion must request exactly one image");
      } else {
        const maxTokens = body.max_completion_tokens ?? body.max_tokens;
        if (
          body.model !== "gpt-5.6-luna" ||
          typeof maxTokens !== "number" ||
          maxTokens > 1024 ||
          JSON.stringify(body.messages).length > 4096
        )
          throw new Error(
            "OpenAI text request exceeded its declared model/token bound",
          );
      }
      ledger.claimDispatch(plan.provider, {
        endpoint: `${url.origin}${url.pathname}`,
        body: redactCompletionEvidence(body),
      });
      const response = await originalFetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(90_000)])
          : AbortSignal.timeout(90_000),
      });
      let summary: unknown;
      try {
        const json = inputRecord.parse(await response.clone().json());
        summary = {
          id: json.id,
          name: json.name,
          status: response.status,
          state: json.state ?? json.status,
        };
      } catch {
        summary = { status: response.status, body: "not-json" };
      }
      writeExclusiveEvidence(
        join(ledger.directory, `${plan.provider}.accepted.json`),
        summary,
      );
      return response;
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      throw new Error("Unallocated provider mutation refused");
    return originalFetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(90_000)])
        : AbortSignal.timeout(90_000),
    });
  };
}

async function sourceFrame(directory: string): Promise<string> {
  const prior = join(directory, "fal.result.json");
  if (existsSync(prior)) {
    const result = resultSchema.parse(JSON.parse(readFileSync(prior, "utf8")));
    if (result.status === "completed" && result.artifact) {
      const bytes = await readFile(result.artifact.path);
      const format = String(result.artifact.verification.format);
      return `data:image/${format};base64,${bytes.toString("base64")}`;
    }
  }
  return tinyPngDataUri(0x40, 512);
}

function sourceProvenance(directory: string): string {
  const prior = join(directory, "fal.result.json");
  return existsSync(prior) &&
    resultSchema.parse(JSON.parse(readFileSync(prior, "utf8"))).status ===
      "completed"
    ? "single completed fal output"
    : "predeclared controlled512x512 PNG fallback; selected owned bytes verified in HTTP proof";
}

async function dispatch(
  plan: CompletionPlan,
  ledger: CompletionLedger,
  credentials: CompletionCredentials,
): Promise<CompletionArtifact> {
  const key = credentials[plan.provider];
  if (!key) throw new Error("Required provider credential absent");
  if (plan.provider === "fal") {
    const response = await fetch(`https://fal.run/${plan.model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: COMPLETION_PROMPT,
        image_url: tinyPngDataUri(0x40, 512),
        strength: 0.6,
        num_inference_steps: 8,
        seed: 20261003,
        sync_mode: true,
        output_format: "webp",
      }),
    });
    if (!response.ok)
      throw new Error(
        `fal answered HTTP${response.status}: ${(await response.text()).slice(0, 400)}`,
      );
    const output = z
      .object({ images: z.array(z.object({ url: z.string().min(1) })).min(1) })
      .parse(await response.json());
    const uri = output.images[0]?.url;
    if (!uri) throw new Error("fal completed without an image URI");
    const bytes = uri.startsWith("data:")
      ? Buffer.from(uri.split(",")[1] ?? "", "base64")
      : Buffer.from(await (await fetch(uri)).arrayBuffer());
    return saveImageArtifact(ledger.directory, bytes);
  }
  if (plan.provider === "openai-text") {
    if (
      ModelConfig.studio_turn.client !== "openai" ||
      ModelConfig.studio_turn.model !== plan.model
    )
      throw new Error(
        "Configured studio_turn differs from the documented bounded OpenAI model",
      );
    const aiService = new AIModelService({
      clients: {
        openai: new LLMClient({
          providerName: "openai",
          defaultModel: plan.model,
          adapter: new OpenAICompatibleAdapter({
            apiKey: key,
            baseURL: "https://api.openai.com/v1",
            defaultModel: plan.model,
          }),
        }),
      },
    });
    const result = await aiService.execute("studio_turn", {
      systemPrompt: "Respond only with valid JSON.",
      userMessage: COMPLETION_TEXT_PROMPT,
      maxTokens: 1024,
      maxRetries: 0,
      retryOnValidationFailure: false,
      logprobs: false,
    });
    if (!result.text.trim() || result.executedBy.provider !== "openai")
      throw new Error(
        "OpenAI completed without usable text or rerouted provider",
      );
    const path = join(ledger.directory, "openai-text-output.json");
    await writeFile(path, result.text, { flag: "wx", mode: 0o600 });
    return {
      path,
      sha256: createHash("sha256").update(result.text).digest("hex"),
      bytes: Buffer.byteLength(result.text),
      kind: "text",
      verification: { executedBy: result.executedBy, nonempty: true },
    };
  }
  if (plan.provider === "replicate")
    return completeWanViaHttp({
      apiToken: key,
      directory: ledger.directory,
      sourceDataUri: await sourceFrame(ledger.directory),
    });
  const path = join(ledger.directory, `${plan.provider}-output.mp4`);
  if (plan.provider === "google")
    await generateVeoVideo(
      key,
      DEFAULT_VEO_BASE_URL,
      COMPLETION_PROMPT,
      { seconds: "4", size: "720p", aspectRatio: "16:9", seed: 20261003 },
      localCompletionVideoStore(path),
      log,
    );
  return verifyVideoArtifact(path);
}

export async function completeProviderOnce(
  plan: CompletionPlan,
  ledger: CompletionLedger,
  credentials: CompletionCredentials,
): Promise<LiveCompletionResult> {
  const path = join(ledger.directory, `${plan.provider}.result.json`);
  const correctionPath =
    plan.provider === "fal"
      ? join(ledger.directory, "fal-existing-key-correction", "fal.result.json")
      : undefined;
  const evidencePath =
    correctionPath &&
    existsSync(correctionPath) &&
    resultSchema.parse(JSON.parse(readFileSync(correctionPath, "utf8")))
      .status === "completed"
      ? correctionPath
      : path;
  if (existsSync(evidencePath)) {
    const { reason, artifact, ...previous } = resultSchema.parse(
      JSON.parse(readFileSync(evidencePath, "utf8")),
    );
    return {
      ...previous,
      ...(reason !== undefined ? { reason } : {}),
      ...(artifact !== undefined ? { artifact } : {}),
      reusedEvidence: true,
      configuration: {
        ...previous.configuration,
        evidencePath,
        ...(plan.provider === "replicate"
          ? { source: sourceProvenance(ledger.directory) }
          : {}),
      },
    };
  }
  const base: LiveCompletionResult = {
    provider: plan.provider,
    model: plan.model,
    status: "not-verified",
    quality: "not-evaluated",
    seam:
      plan.provider === "openai-text"
        ? "aiService-text"
        : plan.provider === "fal"
          ? "fal-http"
          : plan.provider === "replicate"
            ? "free-http-intake"
            : "production-adapter",
    reserveCents: plan.reserveCents,
    pricingSource: plan.pricingSource,
    configuration: {
      ...plan.configuration,
      ...(plan.provider === "replicate"
        ? { source: sourceProvenance(ledger.directory) }
        : {}),
    },
    elapsedMs: 0,
  };
  if (!credentials[plan.provider])
    return {
      ...base,
      reason: "Required provider credential absent; no dispatch",
    };
  if (!ledger.claim(plan))
    return {
      ...base,
      reason:
        "A paid attempt was already reserved; refusing to resubmit after a restart/ambiguous outcome",
    };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = completionFetchGuard(plan, ledger, originalFetch);
  const start = Date.now();
  let result: LiveCompletionResult;
  try {
    result = {
      ...base,
      status: "completed",
      artifact: await dispatch(plan, ledger, credentials),
      elapsedMs: Date.now() - start,
    };
  } catch (error) {
    result = {
      ...base,
      status: "failed",
      elapsedMs: Date.now() - start,
      reason: errorSummary(error, credentials),
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
  writeExclusiveEvidence(path, result);
  return result;
}
