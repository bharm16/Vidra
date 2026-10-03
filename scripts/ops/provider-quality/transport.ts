import { z } from "zod";
import { tinyPngDataUri } from "../live-provider-smoke/tinyPng";
import { QUALITY_SOURCE } from "./fixtures";

export interface ReceivedPrediction {
  model: string;
  input: Record<string, unknown>;
}

const predictionBody = z.object({ input: z.record(z.string(), z.unknown()) });
export const FIXTURE_OUTPUT_URL =
  "https://fixtures.invalid/provider-quality/output.png";

/** Process-external fetch boundary: no request is ever forwarded to a network. */
export class OfflineProviderTransport {
  readonly received: ReceivedPrediction[] = [];
  readonly unexpected: string[] = [];
  readonly decisions: unknown[] = [];
  readonly llmRequests: Record<string, unknown>[] = [];
  outputUrl = FIXTURE_OUTPUT_URL;
  status: "succeeded" | "processing" = "succeeded";

  readonly fetch: typeof fetch = async (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    // OpenAI's multipart helper probes the fetch implementation's Response.
    if (request.url === "data:," && request.method === "GET")
      return new Response("");
    if (request.url === QUALITY_SOURCE && request.method === "GET") {
      const bytes = Buffer.from(
        tinyPngDataUri(0x40, 16).split(",")[1] ?? "",
        "base64",
      );
      return new Response(new Uint8Array(bytes), {
        headers: { "content-type": "image/png" },
      });
    }
    if (
      url.origin === "https://api.openai.com" &&
      url.pathname === "/v1/videos" &&
      request.method === "POST"
    ) {
      const form = await request.formData();
      const body: Record<string, unknown> = Object.fromEntries(form.entries());
      const imageReference = body["input_reference[image_url]"];
      if (typeof imageReference === "string") {
        body.input_reference = { image_url: imageReference };
        delete body["input_reference[image_url]"];
      }
      this.received.push({ model: String(body.model), input: body });
      return Response.json({
        id: "quality-video",
        status: "completed",
        model: body.model,
      });
    }
    if (
      url.origin === "https://api.openai.com" &&
      url.pathname === "/v1/videos/quality-video/content" &&
      request.method === "GET"
    ) {
      return new Response(new Uint8Array([0]), {
        headers: { "content-type": "video/mp4" },
      });
    }
    if (
      url.origin === "https://generativelanguage.googleapis.com" &&
      url.pathname ===
        "/v1beta/models/veo-3.1-generate-preview:predictLongRunning" &&
      request.method === "POST"
    ) {
      const body = z
        .record(z.string(), z.unknown())
        .parse(await request.json());
      this.received.push({ model: "veo-3.1-generate-preview", input: body });
      return Response.json({ name: "operations/quality-video" });
    }
    if (
      url.origin === "https://generativelanguage.googleapis.com" &&
      url.pathname === "/v1beta/operations/quality-video" &&
      request.method === "GET"
    ) {
      return Response.json({
        name: "operations/quality-video",
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: this.outputUrl } }],
          },
        },
      });
    }
    if (
      url.origin === "https://fal.run" &&
      url.pathname === "/fal-ai/z-image/turbo/image-to-image" &&
      request.method === "POST"
    ) {
      const body = z
        .record(z.string(), z.unknown())
        .parse(await request.json());
      this.received.push({
        model: "fal-ai/z-image/turbo/image-to-image",
        input: body,
      });
      return Response.json({
        images: [{ url: this.outputUrl, width: 512, height: 512 }],
        seed: body.seed,
      });
    }
    if (
      url.origin === "https://api.openai.com" &&
      url.pathname === "/v1/chat/completions" &&
      request.method === "POST"
    ) {
      const body = z
        .record(z.string(), z.unknown())
        .parse(await request.json());
      this.llmRequests.push(body);
      const decision = this.decisions.shift();
      if (!decision)
        throw new Error("Offline studio decision fixture exhausted");
      return Response.json({
        id: "quality-decision",
        object: "chat.completion",
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(decision) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });
    }
    const match = /^\/v1\/models\/(.+)\/predictions$/.exec(url.pathname);
    if (
      url.origin === "https://api.replicate.com" &&
      request.method === "POST" &&
      match?.[1]
    ) {
      const body = predictionBody.parse(await request.json());
      this.received.push({ model: match[1], input: body.input });
      return Response.json({
        id: "quality-fixture",
        status: this.status,
        output: this.outputUrl,
      });
    }
    if (
      url.origin === "https://api.replicate.com" &&
      request.method === "GET" &&
      url.pathname === "/v1/predictions/quality-fixture"
    ) {
      return Response.json({
        id: "quality-fixture",
        status: this.status,
        output: this.outputUrl,
      });
    }
    // Replicate FileOutput eagerly opens the output stream. These controlled
    // bytes establish no claim about playable media or visual quality.
    if (request.url === this.outputUrl && request.method === "GET") {
      return new Response(new Uint8Array([0]), {
        headers: { "content-type": "application/octet-stream" },
      });
    }
    const description = `${request.method} ${url.origin}${url.pathname}`;
    this.unexpected.push(description);
    throw new Error(
      `Offline quality transport refused unexpected request: ${description}`,
    );
  };
}

let active = false;

/** Adapters construct their real SDK after the guard is installed. Serial only. */
export async function withOfflineProviderTransport<T>(
  operation: (transport: OfflineProviderTransport) => Promise<T>,
): Promise<T> {
  if (active) throw new Error("Offline provider evaluations must run serially");
  active = true;
  const originalFetch = globalThis.fetch;
  const transport = new OfflineProviderTransport();
  globalThis.fetch = transport.fetch;
  try {
    return await operation(transport);
  } finally {
    globalThis.fetch = originalFetch;
    active = false;
  }
}
