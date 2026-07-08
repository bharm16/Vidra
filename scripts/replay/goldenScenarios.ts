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

interface HttpScenario {
  surface: "label-spans" | "suggestions" | "optimize" | "first-frame-preview";
  path: string;
  body: Record<string, unknown>;
}

/** The three LLM surfaces, driven through their real HTTP routes. */
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
