/**
 * Canonical golden-path inputs shared by the record script and the replay
 * integration suite.
 *
 * Replay matches on a hash of the exact request the server builds from these
 * inputs, so the recorder and the suite MUST send byte-identical bodies —
 * import from here, never inline copies.
 */

/** Same one-liner the golden-path e2e spec uses — the product's definition of working. */
export const GOLDEN_PROMPT =
  "a lighthouse keeper reading by lamplight during a storm";

export const GOLDEN_SCENARIO = "golden-path";

/**
 * The target model the client sends when it compiles for motion —
 * `client/src/features/generations/api/compilePrompt.ts` posts
 * `targetModel: "wan"` to /api/optimize-compile. Keep this in step with that
 * call site: a divergence makes the compile stage replay a miss.
 */
export const GOLDEN_COMPILE_TARGET_MODEL = "wan";

interface HttpScenario {
  surface:
    | "label-spans"
    | "suggestions"
    | "optimize"
    | "optimize-compile"
    | "first-frame-preview";
  path: string;
  body: Record<string, unknown>;
}

/** The LLM surfaces, driven through their real HTTP routes. */
export const HTTP_SCENARIOS: HttpScenario[] = [
  {
    surface: "label-spans",
    path: "/api/llm/label-spans",
    body: { text: GOLDEN_PROMPT },
  },
  {
    surface: "suggestions",
    path: "/api/enhancement/suggestions",
    body: {
      highlightedText: "lamplight",
      fullPrompt: GOLDEN_PROMPT,
      contextBefore: "a lighthouse keeper reading by ",
      contextAfter: " during a storm",
    },
  },
  {
    surface: "optimize",
    path: "/api/optimize",
    body: { prompt: GOLDEN_PROMPT },
  },
  /**
   * The motion step's compile stage. /api/optimize (no targetModel) skips
   * compilation entirely — optimizeFlow gates it on `targetModel && mode ===
   * "video"` — so without this scenario the compile-stage LLM calls
   * (video_prompt_ir_extraction / video_prompt_rewrite) are never recorded and
   * the gate cannot see them.
   */
  {
    surface: "optimize-compile",
    path: "/api/optimize-compile",
    body: {
      prompt: GOLDEN_PROMPT,
      targetModel: GOLDEN_COMPILE_TARGET_MODEL,
    },
  },
];

/**
 * First-frame preview is exercised at the provider seam: the HTTP route also
 * reserves Firestore credits and persists to GCS, which record/replay does
 * not cover (see docs/architecture/replay-mode.md).
 */
export const PREVIEW_SCENARIO = {
  surface: "first-frame-preview" as const,
  request: {
    prompt: GOLDEN_PROMPT,
    aspectRatio: "16:9",
    userId: "replay-golden",
  },
};

// ─────────────────────────────────────────────────────────────────────
// Cross-mode walkthrough (issue #90)
//
// The sketch → studio → session → clip loop. Same rule as the Idea Box pack
// above: these are the canonical inputs, and the suite that replays them and
// anything that re-records them must send byte-identical bodies, so they are
// changed HERE and nowhere else.
//
// The image payloads are minimal but genuine PNGs — `validateImageBuffer`
// sniffs magic bytes, so arbitrary text is rejected on the way in. Each one
// differs in its trailing bytes so the three pictures have distinct digests
// and distinct content-addressed storage paths.
// ─────────────────────────────────────────────────────────────────────

export const CROSS_MODE_SURFACE = "cross-mode" as const;
export const CROSS_MODE_SCENARIO = "sketch-to-clip";

/** The words the creator is sketching under, and the session's first words. */
export const CROSS_MODE_PROMPT = "a paper boat on a wet street at night";

/** The drawing, as the live editor snapshots it. */
export const CROSS_MODE_SKETCH_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgEBAQE=";

/** The picture the relay answers with, and the one "Use this" admits. */
export const CROSS_MODE_LIVE_OUTPUT_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgICAgI=";

/** The studio's edit of the bridged picture. */
export const CROSS_MODE_STUDIO_EDIT_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgMDAwM=";

/**
 * The studio's unrelated generation — four distinct pictures, one per variant.
 * Distinct on purpose: identical bytes would content-address to one storage
 * path, so a per-variant failure could not be aimed at a single sibling.
 */
export const CROSS_MODE_STUDIO_VARIANT_DATA_URIS = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgQEBAQ=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgUFBQU=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgYGBgY=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgcHBwc=",
] as const;

/** The settings that produced the accepted live output. */
export const CROSS_MODE_SKETCH_INPUTS = {
  prompt: CROSS_MODE_PROMPT,
  strength: 0.75,
  steps: 4,
  seed: 20_260_917,
};

/** The frame body the live editor posts to the relay, verbatim. */
export const CROSS_MODE_SKETCH_FRAME = {
  prompt: CROSS_MODE_PROMPT,
  image_url: CROSS_MODE_SKETCH_DATA_URI,
  strength: CROSS_MODE_SKETCH_INPUTS.strength,
  num_inference_steps: CROSS_MODE_SKETCH_INPUTS.steps,
  seed: CROSS_MODE_SKETCH_INPUTS.seed,
};

/** Stable across every retry AND every re-press of this one acceptance. */
export const CROSS_MODE_ACCEPT_KEY = "cross-mode-accept-1";

/**
 * The creator's three messages in the studio, in order.
 *
 * The first turn of a project cannot edit — `edit` and `transform` need images
 * that only a prior turn can have produced, so the studio's first-turn action
 * set excludes them. The walkthrough therefore opens with a vague message the
 * studio answers by asking, then refines the bridged picture, then generates
 * something unrelated: the third message is ADR-0022 decision 4's
 * discriminating case (an unrelated generation in an origin-linked project
 * comes back with NO picture ancestor).
 */
export const CROSS_MODE_STUDIO_OPENING_MESSAGE = "make this better";

/** The creator's message in the studio, on the bridged picture. */
export const CROSS_MODE_STUDIO_EDIT_MESSAGE = "take the reflection out";

/** A second message in the same project that consumes nothing from it. */
export const CROSS_MODE_STUDIO_UNRELATED_MESSAGE =
  "now something completely different: a lighthouse at dawn";

/**
 * A third message: an edit of one of those unrelated pictures.
 *
 * ADR-0022 decision 3's other half — only a DIRECT consumption of the bridged
 * picture earns a refine edge. This turn consumes a studio image the session
 * has never seen, so the take it returns must have no picture ancestor at all
 * rather than being attached to whichever sibling happens to be listed first.
 */
export const CROSS_MODE_STUDIO_SECOND_EDIT_MESSAGE =
  "now warm the light in that one";

/** The camera path the picker writes into the creator's words (ADR-0022 D7). */
export const CROSS_MODE_CAMERA_DIRECTION = "slow dolly in";
/** A second choice, to prove a camera span replaces rather than accumulates. */
export const CROSS_MODE_CAMERA_DIRECTION_2 = "slow push out";

/**
 * The clip the controlled video provider returns. Not a recorded response: the
 * video provider is a controlled adapter (see
 * docs/architecture/cross-mode-golden-path.md), because what this walkthrough
 * proves about a clip is where it lands, not what it looks like.
 */
export const CROSS_MODE_CLIP = {
  assetId: "cross-mode-clip-asset",
  videoUrl: "https://objects.cross-mode.invalid/provider/cross-mode-clip.mp4",
  contentType: "video/mp4",
  inputMode: "i2v" as const,
  sizeBytes: 2048,
};
