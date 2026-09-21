import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIResponse, IAIClient } from "@interfaces/IAIClient";
import type { ResolvedExecution } from "@services/ai-model/types";
import { CassetteStore } from "@server/replay/CassetteStore";
import { RecordReplayAiService } from "@server/replay/RecordReplayAiService";
import { createSketchRelayFetch } from "@server/replay/RecordReplaySketchRelay";
import type { ReplayCaptureProvenance } from "@shared/schemas/replay.schemas";

/**
 * Capture provenance (issue #139): every entry a seam records must name the
 * EFFECTIVE operation, provider and model it ran on — read from the live
 * configuration at capture time, never a constant — plus the parameters and
 * the capture run. These tests assert the relation to the code's own
 * resolution (executedBy / the dispatched URL), so a config change cannot
 * make the provenance lie. They also pin the offline-replayable media
 * capture: produced frames are inlined as data URIs.
 */

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "replay-provenance-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

const SUGGESTIONS_JSON =
  '[{"text":"warmer lighting"},{"text":"tighter framing"},{"text":"softer focus"}]';

function fakeClient(text: string): IAIClient {
  return {
    complete: vi.fn(async (): Promise<AIResponse> => ({
      text,
      metadata: { provider: "fake", model: "fake-model" },
    })),
  };
}

const NO_CLIENTS = { openai: null, groq: null, qwen: null, gemini: null };

function imageResponse(bytes: number[], contentType: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("ai-model capture provenance", () => {
  it("names the same effective provider/model the router resolved", async () => {
    const dir = makeTempDir();
    const recordStore = new CassetteStore({ fixturesDir: dir });
    recordStore.beginScenario("suggestions", "ai-provenance");
    const recorder = new RecordReplayAiService({
      clients: { ...NO_CLIENTS, qwen: fakeClient(SUGGESTIONS_JSON) },
      mode: "record",
      store: recordStore,
    });

    const executedBy = (
      await recorder.execute("enhance_suggestions", {
        systemPrompt: "generate suggestions",
        userMessage: "a cat on a windowsill",
      })
    ).executedBy as ResolvedExecution;
    recordStore.flush();

    const cassette = JSON.parse(
      readFileSync(join(dir, "suggestions", "ai-provenance.json"), "utf8"),
    ) as { entries: Array<{ provenance?: ReplayCaptureProvenance }> };
    const provenance = cassette.entries[0]?.provenance;
    // The relation, not a literal: whatever the env-overridable config
    // resolves at capture time is what the entry must name.
    expect(provenance?.provider).toBe(executedBy.provider);
    expect(provenance?.model).toBe(executedBy.model);
    expect(provenance?.operation).toBe("enhance_suggestions");
    expect(provenance?.origin).toBe("live");
    expect(provenance?.capture).toMatchObject({
      replayMode: "record",
      formatVersion: 1,
    });
    expect(provenance?.parameters).toMatchObject({
      client: executedBy.client,
      stream: false,
    });
  });
});

describe("sketch relay capture provenance", () => {
  const RELAY_URL = "https://fal.run/fal-ai/z-image/turbo/image-to-image";
  const DISPATCH_BODY = JSON.stringify({
    prompt: "a boat",
    image_url: "data:image/png;base64,AAAA",
    strength: 0.75,
    num_inference_steps: 4,
    seed: 20_260_917,
  });

  it("reads provider and model off the URL actually dispatched", async () => {
    const dir = makeTempDir();
    const store = new CassetteStore({ fixturesDir: dir });
    store.beginScenario("cross-mode", "relay-provenance");
    const fetchFn = createSketchRelayFetch({
      mode: "record",
      store,
      inner: vi.fn(async () => Response.json({
        images: [{ url: "https://fal.media/frame-1.webp" }],
        seed: 20_260_917,
      })),
      fetchImage: vi.fn(async () => imageResponse([1, 2, 3], "image/webp")),
    });

    const response = await fetchFn(RELAY_URL, {
      method: "POST",
      body: DISPATCH_BODY,
    });
    expect(response.status).toBe(200);
    store.flush();

    const cassette = JSON.parse(
      readFileSync(join(dir, "cross-mode", "relay-provenance.json"), "utf8"),
    ) as {
      entries: Array<{
        provenance?: ReplayCaptureProvenance;
        response: { images: Array<{ url: string }> };
      }>;
    };
    const entry = cassette.entries[0];
    if (!entry) throw new Error("relay pack has no entries");
    expect(entry.provenance).toMatchObject({
      operation: "sketch_frame",
      provider: "fal.run",
      model: "fal-ai/z-image/turbo/image-to-image",
      origin: "live",
      parameters: { strength: 0.75, steps: 4, seed: 20_260_917 },
    });
    // The produced frame is captured inline, so the pack replays offline.
    expect(entry.response.images[0]?.url).toBe("data:image/webp;base64,AQID");
  });

  it("inlines every remote image of a multi-image answer, passes data URIs through", async () => {
    const dir = makeTempDir();
    const store = new CassetteStore({ fixturesDir: dir });
    store.beginScenario("cross-mode", "relay-multi-image");
    const fetchFn = createSketchRelayFetch({
      mode: "record",
      store,
      inner: vi.fn(async () =>
        Response.json({
          images: [
            { url: "https://fal.media/a.webp" },
            { url: "data:image/png;base64,BBBB" },
          ],
        }),
      ),
      fetchImage: vi.fn(async () => imageResponse([4], "image/png")),
    });

    await fetchFn(RELAY_URL, { method: "POST", body: DISPATCH_BODY });
    store.flush();

    const cassette = JSON.parse(
      readFileSync(join(dir, "cross-mode", "relay-multi-image.json"), "utf8"),
    ) as {
      entries: Array<{ response: { images: Array<{ url: string }> } }>;
    };
    expect(cassette.entries[0]?.response.images.map((image) => image.url)).toEqual([
      "data:image/png;base64,BA==",
      "data:image/png;base64,BBBB",
    ]);
  });
});
