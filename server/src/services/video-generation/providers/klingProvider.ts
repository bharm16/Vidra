import { z } from "zod";
import type {
  KlingAspectRatio,
  KlingModelId,
  VideoGenerationOptions,
} from "../types";
import { sleep, pollingDelay } from "@utils/sleep";
import { getProviderPollTimeoutMs } from "./timeoutPolicy";

type LogSink = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

interface KlingTextToVideoInput {
  model_name?: KlingModelId;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: KlingAspectRatio;
}

interface KlingImageToVideoInput {
  model_name?: KlingModelId;
  prompt: string;
  image: string;
  image_tail?: string;
  negative_prompt?: string;
  aspect_ratio?: KlingAspectRatio;
  duration?: "5" | "10";
  mode?: "std" | "pro";
}

export const DEFAULT_KLING_BASE_URL = "https://api.klingai.com";

// Kling's API rejects empty/whitespace prompt strings (HTTP 400). When the
// caller passes "" — which the i2v pipeline does intentionally for image-only
// inputs — substitute a neutral placeholder so the request succeeds. Kept
// adapter-local: the route layer still passes through whatever the client sent.
const KLING_EMPTY_PROMPT_SUBSTITUTE = "natural motion";

const KLING_STATUS_POLL_INTERVAL_MS = 2000;
const KLING_FETCH_TIMEOUT_MS = 30_000;

const KLING_TASK_STATUS_SCHEMA = z.enum([
  "submitted",
  "processing",
  "succeed",
  "failed",
]);

const KLING_CREATE_TASK_RESPONSE_SCHEMA = z.object({
  code: z.number(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z.object({
    task_id: z.string(),
    task_status: KLING_TASK_STATUS_SCHEMA,
    task_info: z.object({ external_task_id: z.string().optional() }).optional(),
    created_at: z.number().optional(),
    updated_at: z.number().optional(),
  }),
});

const KLING_I2V_CREATE_TASK_RESPONSE_SCHEMA = z.object({
  code: z.number(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z.object({
    task_id: z.string(),
    task_status: KLING_TASK_STATUS_SCHEMA,
  }),
});

const KLING_TASK_RESULT_RESPONSE_SCHEMA = z.object({
  code: z.number(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z.object({
    task_id: z.string(),
    task_status: KLING_TASK_STATUS_SCHEMA,
    task_status_msg: z.string().optional(),
    task_result: z
      .object({
        videos: z
          .array(
            z.object({
              id: z.string(),
              url: z.string(),
              duration: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});

function resolveKlingAspectRatio(
  aspectRatio: VideoGenerationOptions["aspectRatio"],
  log: LogSink,
): KlingAspectRatio | undefined {
  if (!aspectRatio) {
    return undefined;
  }
  if (aspectRatio === "21:9") {
    log.warn("Kling does not support 21:9; using 16:9 instead", {
      aspectRatio,
    });
    return "16:9";
  }
  if (
    aspectRatio !== "16:9" &&
    aspectRatio !== "9:16" &&
    aspectRatio !== "1:1"
  ) {
    log.warn("Unsupported Kling aspect ratio; defaulting to 16:9", {
      aspectRatio,
    });
    return "16:9";
  }
  return aspectRatio;
}

function resolveKlingDuration(
  seconds?: VideoGenerationOptions["seconds"],
): "5" | "10" | undefined {
  if (seconds === "5" || seconds === "10") {
    return seconds;
  }
  return undefined;
}

async function klingFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(KLING_FETCH_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {}),
      },
      signal,
    });
  } catch (error) {
    const caughtByTimeout =
      timeoutSignal.aborted && !(init.signal?.aborted ?? false);
    const isTimeoutError =
      error instanceof Error && error.name === "TimeoutError";
    if (caughtByTimeout || isTimeoutError) {
      throw new Error(
        `Kling request timed out after ${KLING_FETCH_TIMEOUT_MS}ms: ${path}`,
      );
    }
    throw error;
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Non-JSON response (${response.status}): ${text.slice(0, 400)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(json).slice(0, 800)}`,
    );
  }

  return json;
}

function parseKlingResponse<T>(
  schema: z.ZodType<T>,
  json: unknown,
  endpoint: string,
): T {
  try {
    return schema.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Kling API response validation failed for ${endpoint}: ${detail}`,
    );
  }
}

async function createKlingTask(
  baseUrl: string,
  apiKey: string,
  input: KlingTextToVideoInput,
): Promise<string> {
  const json = await klingFetch(baseUrl, apiKey, "/v1/videos/text2video", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const parsed = parseKlingResponse(
    KLING_CREATE_TASK_RESPONSE_SCHEMA,
    json,
    "text2video/create",
  );

  if (parsed.code !== 0) {
    throw new Error(
      `Kling error code=${parsed.code}: ${parsed.message ?? "unknown error"}`,
    );
  }

  return parsed.data.task_id;
}

async function createKlingImageToVideoTask(
  baseUrl: string,
  apiKey: string,
  input: KlingImageToVideoInput,
): Promise<string> {
  const json = await klingFetch(baseUrl, apiKey, "/v1/videos/image2video", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const parsed = parseKlingResponse(
    KLING_I2V_CREATE_TASK_RESPONSE_SCHEMA,
    json,
    "image2video/create",
  );

  if (parsed.code !== 0) {
    throw new Error(
      `Kling i2v error code=${parsed.code}: ${parsed.message ?? "unknown error"}`,
    );
  }

  return parsed.data.task_id;
}

async function waitForKlingTask(
  baseUrl: string,
  apiKey: string,
  taskId: string,
  endpoint: "text2video" | "image2video",
): Promise<string> {
  const timeoutMs = getProviderPollTimeoutMs();
  const start = Date.now();

  while (true) {
    const json = await klingFetch(
      baseUrl,
      apiKey,
      `/v1/videos/${endpoint}/${encodeURIComponent(taskId)}`,
      { method: "GET" },
    );
    const parsed = parseKlingResponse(
      KLING_TASK_RESULT_RESPONSE_SCHEMA,
      json,
      `${endpoint}/status`,
    );

    if (parsed.code !== 0) {
      throw new Error(
        `Kling error code=${parsed.code}: ${parsed.message ?? "unknown error"}`,
      );
    }

    const task = parsed.data;

    if (task.task_status === "succeed") {
      const url = task.task_result?.videos?.[0]?.url;
      if (!url) {
        throw new Error(
          `Kling ${endpoint} task succeeded but no video URL was returned.`,
        );
      }
      return url;
    }

    if (task.task_status === "failed") {
      throw new Error(
        `Kling ${endpoint} task failed: ${task.task_status_msg ?? "no reason provided"}`,
      );
    }

    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      throw new Error(`Timed out waiting for Kling ${endpoint} task ${taskId}`);
    }

    await sleep(pollingDelay(KLING_STATUS_POLL_INTERVAL_MS, elapsed));
  }
}

export async function generateKlingVideo(
  apiKey: string,
  baseUrl: string,
  prompt: string,
  modelId: KlingModelId,
  options: VideoGenerationOptions,
  log: LogSink,
): Promise<{ url: string; resolvedAspectRatio?: string }> {
  const effectivePrompt =
    prompt && prompt.trim().length > 0 ? prompt : KLING_EMPTY_PROMPT_SUBSTITUTE;

  if (options.startImage) {
    return generateKlingImageToVideo(
      apiKey,
      baseUrl,
      effectivePrompt,
      modelId,
      options,
      log,
    );
  }

  const aspectRatio = resolveKlingAspectRatio(options.aspectRatio, log);
  const input: KlingTextToVideoInput = {
    model_name: modelId,
    prompt: effectivePrompt,
    ...(options.negativePrompt
      ? { negative_prompt: options.negativePrompt }
      : {}),
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
  };

  const taskId = await createKlingTask(baseUrl, apiKey, input);
  log.info("Kling t2v generation started", { modelId, taskId });

  const url = await waitForKlingTask(baseUrl, apiKey, taskId, "text2video");
  return { url, ...(aspectRatio ? { resolvedAspectRatio: aspectRatio } : {}) };
}

async function generateKlingImageToVideo(
  apiKey: string,
  baseUrl: string,
  prompt: string,
  modelId: KlingModelId,
  options: VideoGenerationOptions,
  log: LogSink,
): Promise<{ url: string; resolvedAspectRatio?: string }> {
  const aspectRatio = resolveKlingAspectRatio(options.aspectRatio, log);
  const duration = resolveKlingDuration(options.seconds);
  const input: KlingImageToVideoInput = {
    model_name: modelId,
    prompt,
    image: options.startImage!,
    ...(options.endImage ? { image_tail: options.endImage } : {}),
    ...(options.negativePrompt
      ? { negative_prompt: options.negativePrompt }
      : {}),
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(duration ? { duration } : {}),
  };

  const taskId = await createKlingImageToVideoTask(baseUrl, apiKey, input);
  log.info("Kling i2v generation started", {
    modelId,
    taskId,
    imageUrl: options.startImage,
    hasEndImage: Boolean(options.endImage),
  });

  const url = await waitForKlingTask(baseUrl, apiKey, taskId, "image2video");
  return { url, ...(aspectRatio ? { resolvedAspectRatio: aspectRatio } : {}) };
}
