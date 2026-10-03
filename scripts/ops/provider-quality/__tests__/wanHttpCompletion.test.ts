import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import { completeWanViaHttp } from "../wanHttpCompletion";
import { tinyPngDataUri } from "../../live-provider-smoke/tinyPng";
import { installOutboundGuard } from "#tests/integration/helpers/cross-mode/outboundGuard";

/** Unit setup stubs global fetch; this fixture must reach its real local API. */
const loopbackFetch: typeof fetch = async (input, init): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(`The controlled HTTP proof cannot call ${url.origin}`);
  }
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : Buffer.from(await request.arrayBuffer());
  return await new Promise<Response>((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        signal: request.signal,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("error", reject);
        incoming.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (typeof value === "string") headers.set(name, value);
            else if (value)
              for (const item of value) headers.append(name, item);
          }
          resolve(
            new Response(new Uint8Array(Buffer.concat(chunks)), {
              status: incoming.statusCode ?? 500,
              headers,
            }),
          );
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
};

const mediaToolsAvailable =
  spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0 &&
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

describe("single live Wan HTTP runner over controlled provider transport", () => {
  it.skipIf(!mediaToolsAvailable)(
    "uses real intake/worker and preserves source bytes, authoritative receipt and attached download",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "vidra-wan-http-test-"));
      const clip = await readFile(
        new URL("../../../../tests/e2e/cross-mode/clip.mp4", import.meta.url),
      );
      const received: Record<string, unknown>[] = [];
      const previousFetch = globalThis.fetch;
      globalThis.fetch = loopbackFetch;
      // record-mode runner keeps its own routed object boundary; the outer
      // guard additionally forbids any unexpected provider/classic-HTTP call.
      const noEgress = installOutboundGuard();
      const external: typeof fetch = async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (
          url.origin === "https://api.replicate.com" &&
          request.method === "POST"
        ) {
          received.push((await request.json()) as Record<string, unknown>);
          return Response.json({
            id: "http-proof-prediction",
            status: "succeeded",
            output:
              "https://objects.cross-mode.invalid/provider/live-completion-fixture.mp4",
          });
        }
        return fetch(input, init);
      };
      try {
        const artifact = await completeWanViaHttp({
          apiToken: "controlled-provider-key",
          directory,
          sourceDataUri: tinyPngDataUri(0x40, 32),
          providerFetch: external,
          providerOutputFixture: clip,
        });
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({
          input: {
            image: tinyPngDataUri(0x40, 32),
            num_frames: 81,
            frames_per_second: 16,
          },
        });
        expect(artifact.verification.decoded).toBe(true);
        const proof = JSON.parse(
          await readFile(
            join(directory, "replicate.http-completion.json"),
            "utf8",
          ),
        );
        expect(proof).toMatchObject({
          attachment: { state: "attached" },
          reopenedThroughHttp: true,
          controlledPersistence: true,
        });
        expect(proof.providerTranscript).toHaveLength(1);
        noEgress.assertNoOutboundCalls();
      } finally {
        noEgress.restore();
        globalThis.fetch = previousFetch;
        await rm(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
