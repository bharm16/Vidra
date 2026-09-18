import { z } from "zod";
import type { ReplaySketchFrameRequest } from "@shared/schemas/replay.schemas";
import type { CassetteStore } from "./CassetteStore";
import { ReplayError } from "./errors";
import { sketchFrameRequestKey, sketchImageDigest } from "./requestKey";
import { ReplaySeam, type ReplayMode } from "./ReplaySeam";

/**
 * Record/replay seam at the sketch relay's upstream call.
 *
 * Every other place the authoring loop leaves the process goes through a
 * provider adapter, so a seam could substitute for it by registration. The
 * relay is the exception: it holds FAL_KEY and calls its injected `fetch`
 * directly, which is why it was the one live-network hole left in
 * REPLAY_MODE=replay (issue #90). The seam closes it at the same place the
 * relay already accepts an injection — `fetchFn` — so the route keeps its one
 * upstream call site and learns nothing about replay.
 *
 * What it is NOT: a general HTTP recorder. It understands exactly one request
 * shape, fails loudly on anything else, and mirrors the relay's own contract
 * (fal's JSON, verbatim) back out.
 */

/** The relay's injection point, restated so the seam satisfies it by type. */
export type SketchRelayFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * The half of the relay's outgoing body this seam identifies a frame by. The
 * rest of what the relay sends (`sync_mode`, `output_format`) is dispatch
 * mechanics pinned beside the model, not something the creator changed.
 */
const DispatchedFrameSchema = z.object({
  prompt: z.string().min(1),
  image_url: z.string().min(1),
  strength: z.number(),
  num_inference_steps: z.number().int(),
  seed: z.number().int(),
});

function readDispatchedFrame(init: RequestInit | undefined): {
  prompt: string;
  imageUrl: string;
  strength: number;
  steps: number;
  seed: number;
} {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new ReplayError(
      "Sketch relay seam expected a JSON string body; the relay's dispatch " +
        "shape changed and the seam can no longer key the frame.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ReplayError("Sketch relay seam received a non-JSON frame body");
  }
  const frame = DispatchedFrameSchema.safeParse(parsed);
  if (!frame.success) {
    throw new ReplayError(
      `Sketch relay seam could not read the dispatched frame: ${frame.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return {
    prompt: frame.data.prompt,
    imageUrl: frame.data.image_url,
    strength: frame.data.strength,
    steps: frame.data.num_inference_steps,
    seed: frame.data.seed,
  };
}

/**
 * Build the relay's `fetchFn` for the active replay mode.
 *
 * In replay the recorded frame is served as a fresh 200 JSON `Response`, so the
 * relay's `upstream.text()` / status mirroring runs exactly as it does live.
 * In record the live call happens once and its body is read once, then handed
 * back in a new Response — a consumed body cannot be re-read downstream.
 */
export function createSketchRelayFetch({
  mode,
  store,
  inner = fetch,
}: {
  mode: ReplayMode;
  store: CassetteStore;
  /** The live upstream. Only ever called in record mode. */
  inner?: SketchRelayFetch;
}): SketchRelayFetch {
  const seam = new ReplaySeam({
    seam: "sketch-frame",
    mode,
    store,
    keyOf: sketchFrameRequestKey,
  });

  return async (url: string, init?: RequestInit): Promise<Response> => {
    const frame = readDispatchedFrame(init);
    const request: ReplaySketchFrameRequest = {
      endpoint: url,
      prompt: frame.prompt,
      imageDigest: sketchImageDigest(frame.imageUrl),
      strength: frame.strength,
      steps: frame.steps,
      seed: frame.seed,
    };

    const recorded = await seam.through({
      request,
      summary: `sketch relay frame (seed ${frame.seed}, strength ${frame.strength})`,
      scenario: "sketch-frame",
      contract: "sketch-frame-result",
      live: async () => {
        const upstream = await inner(url, init);
        if (!upstream.ok) {
          // A failed upstream is not a frame; recording it would teach replay
          // to serve an error as if it were a picture.
          throw new ReplayError(
            `Sketch relay upstream answered ${upstream.status} while recording`,
          );
        }
        return (await upstream.json()) as unknown;
      },
      toRecorded: (response) =>
        response as { images: Array<{ url: string }> } & Record<
          string,
          unknown
        >,
    });

    return new Response(JSON.stringify(recorded), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
