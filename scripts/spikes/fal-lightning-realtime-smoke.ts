/**
 * Smoke gate for the realtime-sketch spike (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 *
 * Proves, before any UI work:
 *   1. FAL_KEY can mint a short-lived JWT scoped to the approved model (the browser auth path)
 *   2. fal-ai/fast-lightning-sdxl/image-to-image answers over the realtime WebSocket
 *   3. The payload/result field names the spec assumes (image_url data URI, sync_mode,
 *      strength, timings) hold on the wire
 *
 * Run: npx tsx scripts/spikes/fal-lightning-realtime-smoke.ts
 */

import "dotenv/config";
import sharp from "sharp";
import { fal } from "@fal-ai/client";

// Endpoint under test is overridable: npx tsx <script> <endpointId>
// Findings so far: lightning /image-to-image subpath realtime-forwards to
// nothing; lightning ROOT realtime answers but IGNORES image_url+strength
// (pure t2i — byte-identical outputs for different sketches). The proven
// realtime i2i reference is fal-ai/fast-lcm-diffusion/image-to-image.
const MODEL_ENDPOINT = process.argv[2] ?? "fal-ai/fast-lightning-sdxl";
const TOKEN_ALLOWLIST_APP = MODEL_ENDPOINT.split("/").slice(0, 2).join("/");
const TOKEN_EXPIRATION_SECONDS = 120;
const RESULT_TIMEOUT_MS = 45_000;

function resolveFalKey(): string {
  const candidates = [process.env.FAL_KEY, process.env.FAL_API_KEY];
  for (const value of candidates) {
    // dotenv runs without dotenv-expand, so FAL_KEY=${FAL_API_KEY} arrives
    // as a literal placeholder — skip it.
    if (value && value.length > 0 && !value.startsWith("${")) {
      return value;
    }
  }
  throw new Error("No usable FAL_KEY / FAL_API_KEY in environment");
}

async function mintScopedToken(key: string): Promise<string> {
  const response = await fetch("https://rest.alpha.fal.ai/tokens/", {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      allowed_apps: [TOKEN_ALLOWLIST_APP],
      token_expiration: TOKEN_EXPIRATION_SECONDS,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`token mint failed: ${response.status} ${body}`);
  }
  // fal returns the JWT as a JSON-encoded string; tolerate a bare string too.
  const trimmed = body.trim();
  const token = trimmed.startsWith('"')
    ? (JSON.parse(trimmed) as string)
    : trimmed;
  console.log(
    `[1/3] minted scoped token (${token.length} chars, apps=[${TOKEN_ALLOWLIST_APP}], exp=${TOKEN_EXPIRATION_SECONDS}s)`,
  );
  return token;
}

async function svgToDataUri(svg: string): Promise<string> {
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function makeSketchPair(): Promise<[string, string]> {
  // Two DELIBERATELY different compositions. If the endpoint honors
  // image_url, the two outputs must differ; byte-identical outputs mean the
  // sketch is being ignored (t2i).
  const lampSketch = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768">
    <rect width="768" height="768" fill="#d9d9d9"/>
    <path d="M 260 640 C 260 360, 300 300, 430 300 C 530 300, 560 340, 560 400"
          stroke="#1e2430" stroke-width="30" fill="none" stroke-linecap="round"/>
    <ellipse cx="560" cy="430" rx="90" ry="60" fill="#e07a1f"/>
    <ellipse cx="560" cy="470" rx="45" ry="28" fill="#f4c542"/>
    <path d="M 170 660 L 350 660 L 300 620 L 220 620 Z" fill="#e07a1f"/>
  </svg>`;
  const barsSketch = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768">
    <rect width="768" height="768" fill="#2b2f3a"/>
    <rect x="80" y="120" width="120" height="530" fill="#e07a1f"/>
    <rect x="320" y="220" width="120" height="430" fill="#f4c542"/>
    <rect x="560" y="60" width="120" height="590" fill="#f5f2ec"/>
  </svg>`;
  const pair: [string, string] = [
    await svgToDataUri(lampSketch),
    await svgToDataUri(barsSketch),
  ];
  console.log(
    `[2/3] two sketch fixtures ready (${Math.round(pair[0].length / 1024)}KB lamp, ${Math.round(pair[1].length / 1024)}KB bars)`,
  );
  return pair;
}

function imageBytes(result: Record<string, unknown>): Buffer | null {
  const images = result.images as Array<Record<string, unknown>> | undefined;
  const content = images?.[0]?.content;
  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }
  if (content && typeof content === "object") {
    return Buffer.from(Object.values(content as Record<string, number>));
  }
  return null;
}

async function runRealtimeFrame(
  falKey: string,
  sketches: [string, string],
): Promise<void> {
  // @fal-ai/client@1.8.4 has no tokenProvider option: in Node it auto-mints
  // its realtime token from credentials (in the browser, via proxyUrl — the
  // app path exercised by /sketch itself).
  fal.config({ credentials: falKey });

  const payloadFor = (imageDataUri: string): Record<string, unknown> => ({
    prompt:
      "4k product photography of an ergonomic desk lamp glowing, studio lighting",
    image_url: imageDataUri,
    strength: 0.75,
    num_inference_steps: 4,
    image_size: { width: 768, height: 768 },
    seed: 42,
    sync_mode: true,
    enable_safety_checker: true,
  });

  let resolveResult: (value: Record<string, unknown>) => void = () => {};
  let rejectResult: (reason: Error) => void = () => {};
  const connection = fal.realtime.connect(MODEL_ENDPOINT, {
    connectionKey: "realtime-sketch-smoke",
    onError: (error) => {
      rejectResult(
        error instanceof Error ? error : new Error(JSON.stringify(error)),
      );
    },
    onResult: (result) => {
      resolveResult(result as Record<string, unknown>);
    },
  });

  const sendFrame = async (
    label: string,
    imageDataUri: string,
  ): Promise<Record<string, unknown>> => {
    const sentAt = Date.now();
    const result = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`no result within ${RESULT_TIMEOUT_MS}ms`)),
          RESULT_TIMEOUT_MS,
        );
        resolveResult = (value) => {
          clearTimeout(timeout);
          resolve(value);
        };
        rejectResult = (reason) => {
          clearTimeout(timeout);
          reject(reason);
        };
        connection.send(payloadFor(imageDataUri));
      },
    );
    const roundTripMs = Date.now() - sentAt;
    const timings = result.timings as Record<string, unknown> | undefined;
    const bytes = imageBytes(result);
    console.log(
      `      ${label}: round-trip ${roundTripMs}ms · timings ${timings ? JSON.stringify(timings) : "(absent)"} · seed ${String(result.seed)} · output ${bytes ? `${bytes.length} bytes` : "NO BYTES"}`,
    );
    return result;
  };

  console.log(
    `[3/3] sending two DIFFERENT sketches to ${MODEL_ENDPOINT} — differing outputs = i2i honored, identical = sketch ignored`,
  );
  const first = await sendFrame("lamp sketch", sketches[0]);
  const second = await sendFrame("bars sketch", sketches[1]);
  const firstBytes = imageBytes(first);
  const secondBytes = imageBytes(second);
  if (firstBytes && secondBytes) {
    const identical =
      firstBytes.length === secondBytes.length &&
      firstBytes.equals(secondBytes);
    console.log(
      `      VERDICT: outputs ${identical ? "BYTE-IDENTICAL — image_url is IGNORED (t2i)" : "DIFFER — i2i honored"}`,
    );
  }

  // Realtime binary protocol: the image arrives as raw JPEG bytes in
  // images[0].content (msgpack), NOT as a url — pinned here for the client.
  const images = second.images as Array<Record<string, unknown>> | undefined;
  const image = images?.[0];
  const content = image?.content;
  const bytes =
    content instanceof Uint8Array
      ? Buffer.from(content)
      : content && typeof content === "object"
        ? Buffer.from(Object.values(content as Record<string, number>))
        : null;
  console.log(
    `      images[0]: keys [${image ? Object.keys(image).join(", ") : ""}], ${String(image?.width)}x${String(image?.height)}, ${bytes ? `${Math.round(bytes.length / 1024)}KB bytes (JPEG magic: ${bytes[0] === 0xff && bytes[1] === 0xd8})` : "NO CONTENT BYTES"}`,
  );

  if (!bytes) {
    throw new Error(
      `no image bytes — full result: ${JSON.stringify(second).slice(0, 300)}`,
    );
  }
  const lampPath = new URL(
    "../../.smoke-render-lamp-sketch.jpg",
    import.meta.url,
  ).pathname;
  const barsPath = new URL(
    "../../.smoke-render-bars-sketch.jpg",
    import.meta.url,
  ).pathname;
  const firstOut = imageBytes(first);
  if (firstOut) {
    await sharp(firstOut).toFile(lampPath);
  }
  await sharp(bytes).toFile(barsPath);
  console.log(`      renders written to ${lampPath} and ${barsPath}`);
}

const key = resolveFalKey();
// Probe the mint contract our /api/fal/proxy route forwards to (the client
// mints its own token internally when connecting below).
await mintScopedToken(key);
const sketches = await makeSketchPair();
await runRealtimeFrame(key, sketches);
console.log("SMOKE GATE PASSED");
process.exit(0);
