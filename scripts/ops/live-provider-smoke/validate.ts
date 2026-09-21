/**
 * Output validation for the bounded live-provider smoke (issue #140).
 *
 * What the smoke asserts — per its spec — is only what a live call can
 * establish and replay cannot: each provider answered inside its timeout and
 * each response satisfies the SAME shared contract the replay cassette is
 * held to (shared/schemas/replay.schemas.ts). Never output quality.
 *
 * On top of the shared contract, each image output's bytes are sniffed
 * (magic bytes only — the same shape of check the product's own
 * `validateImageBuffer` performs at its boundary): a URL that answers 200
 * with HTML is a failed output, not a valid one.
 *
 * Pure module: fetch comes in as a parameter.
 */

import {
  ImagePreviewResultReplayPayloadSchema,
  SketchFrameResultReplayPayloadSchema,
  StudioImageResultReplayPayloadSchema,
} from "../../../shared/schemas/replay.schemas.ts";
import type { SmokeCallRecord } from "./types";

/** Magic bytes of the raster formats the providers are configured to emit. */
const MAGIC_BYTES: readonly { bytes: readonly number[]; format: string }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], format: "png" },
  { bytes: [0xff, 0xd8, 0xff], format: "jpeg" },
  { bytes: [0x52, 0x49, 0x46, 0x46], format: "webp/riff" },
  { bytes: [0x47, 0x49, 0x46, 0x38], format: "gif" },
];

/** A response's parsed-but-unvalidated JSON body. */
export type ParsedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * The fal relay mirrors the upstream response verbatim; the client's own
 * anti-corruption schema and the cassette's contract agree on the same
 * shape. Returns the image URL on success.
 */
export function validateSketchFrameResponse(
  payload: unknown,
): { ok: true; imageUrl: string } | { ok: false; reason: string } {
  const parsed = SketchFrameResultReplayPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `sketch frame violates the shared sketch-frame-result contract: ${parsed.error.issues[0]?.message ?? "unknown issue"}`,
    };
  }
  const url = parsed.data.images[0]?.url ?? "";
  return { ok: true, imageUrl: url };
}

/** The studio turn's settled view (GET /api/studio/projects/:id/turns/:turnId). */
export interface StudioTurnViewPayload {
  status: string;
  decision: { action: string };
  calls: Array<{
    status: string;
    image?: { viewUrl?: string; storagePath?: string } | undefined;
  }>;
}

/**
 * The studio turn leg is validated in two halves: the LLM decision (the
 * studio_turn leg) and the image call it planned (the studio-edit-image
 * leg). A first turn that edits (issue #110) must settle `succeeded` with an
 * `edit` decision and one succeeded image call. The returned records carry
 * their leg labels; the byte-level check of the image itself is the caller's
 * (it needs the harness's object store) and appends its own record.
 */
export function validateStudioEditTurn(
  turn: StudioTurnViewPayload,
): {
  ok: boolean;
  reason?: string;
  records: readonly SmokeCallRecord[];
  imageUrl: string | null;
} {
  if (turn.status !== "succeeded") {
    return {
      ok: false,
      reason: `studio turn settled as "${turn.status}", not "succeeded"`,
      records: [
        {
          leg: "studio-turn",
          outcome: "failed",
          detail: `turn status ${turn.status}`,
        },
      ],
      imageUrl: null,
    };
  }
  if (turn.decision.action !== "edit") {
    return {
      ok: false,
      reason: `studio turn decision was "${turn.decision.action}", not the edit the smoke drove (a first-turn edit must be available — issue #110)`,
      records: [
        {
          leg: "studio-turn",
          outcome: "invalid",
          detail: `action ${turn.decision.action}`,
        },
      ],
      imageUrl: null,
    };
  }

  const succeededCalls = turn.calls.filter(
    (call) => call.status === "succeeded",
  );
  const imageCall = succeededCalls.find(
    (call) => call.image?.viewUrl || call.image?.storagePath,
  );
  const imageUrl = imageCall?.image?.viewUrl ?? imageCall?.image?.storagePath;
  if (!imageCall || !imageUrl) {
    return {
      ok: false,
      reason: `studio edit turn produced no succeeded image call (${String(turn.calls.length)} calls, ${String(succeededCalls.length)} succeeded)`,
      records: [
        { leg: "studio-turn", outcome: "validated", detail: "decision action=edit" },
        { leg: "studio-edit-image", outcome: "failed", detail: "no succeeded image call" },
      ],
      imageUrl: null,
    };
  }

  // The studio image runner's result shape, against the cassette's own
  // contract. The turn view does not carry the runner's timing, so the
  // duration half of the contract is checked as "present and non-negative"
  // (0 = unknown) — the URL half is the live assertion.
  const imageContract = StudioImageResultReplayPayloadSchema.safeParse({
    imageUrl,
    durationMs: 0,
  });
  if (!imageContract.success) {
    return {
      ok: false,
      reason: `studio edit image violates the shared studio-image-result contract: ${imageContract.error.issues[0]?.message ?? "unknown issue"}`,
      records: [
        { leg: "studio-turn", outcome: "validated", detail: "decision action=edit" },
        { leg: "studio-edit-image", outcome: "invalid", detail: "contract mismatch" },
      ],
      imageUrl: null,
    };
  }

  return {
    ok: true,
    records: [
      {
        leg: "studio-turn",
        outcome: "validated",
        detail: "studio_turn decision accepted (action=edit)",
      },
    ],
    imageUrl,
  };
}

/**
 * The first-frame preview route's response body
 * ({ success, data: ImagePreviewResult }), against the cassette's
 * image-preview-result contract.
 */
export function validateFirstFrameResponse(
  payload: unknown,
): { ok: true; imageUrl: string; model: string } | { ok: false; reason: string } {
  if (
    typeof payload !== "object" ||
    payload === null ||
    (payload as { success?: unknown }).success !== true
  ) {
    return { ok: false, reason: "first frame response is not a success body" };
  }
  const data = (payload as { data?: unknown }).data;
  const parsed = ImagePreviewResultReplayPayloadSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `first frame violates the shared image-preview-result contract: ${parsed.error.issues[0]?.message ?? "unknown issue"}`,
    };
  }
  return {
    ok: true,
    imageUrl: parsed.data.imageUrl,
    model: parsed.data.model,
  };
}

/**
 * Fetch an output image's bytes and sniff their magic bytes. The fetch
 * caller owns any timeout; this function owns the verdict.
 */
export async function fetchAndSniffImageBytes(
  url: string,
  fetchFn: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>,
  timeoutMs = 30_000,
): Promise<
  { ok: true; format: string; bytes: number } | { ok: false; reason: string }
> {
  if (!url || !/^https?:\/\//.test(url)) {
    return {
      ok: false,
      reason: `image URL is not http(s): "${url.slice(0, 80)}"`,
    };
  }
  let response: Response;
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return {
      ok: false,
      reason: `image URL fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: `image URL answered ${String(response.status)}`,
    };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const format = sniffImageFormat(buffer);
  if (!format) {
    return {
      ok: false,
      reason: `image bytes are not a recognized raster (${String(buffer.byteLength)} bytes)`,
    };
  }
  return { ok: true, format, bytes: buffer.byteLength };
}

/** Magic-byte sniff over the raster formats the providers emit. */
export function sniffImageFormat(buffer: Buffer): string | null {
  for (const candidate of MAGIC_BYTES) {
    if (candidate.bytes.every((byte, index) => buffer[index] === byte)) {
      return candidate.format;
    }
  }
  return null;
}

/** Read a studio image back from the in-process object store and sniff it. */
export function sniffStoredImageBytes(
  bytes: Buffer | undefined,
): { ok: true; format: string } | { ok: false; reason: string } {
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, reason: "stored studio image has no bytes" };
  }
  const format = sniffImageFormat(bytes);
  if (!format) {
    return {
      ok: false,
      reason: `stored studio image is not a recognized raster (${String(bytes.byteLength)} bytes)`,
    };
  }
  return { ok: true, format };
}
