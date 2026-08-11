import type { VideoPromptSlots } from "./videoPromptTypes.js";

/**
 * How much a finding should cost the caller.
 *
 * - `critical` — the slot set is structurally wrong (a missing or mis-filled
 *   framing/angle slot). Always worth spending a reroll or repair call.
 * - `quality` — the slot set is well-formed but reads badly (viewer-facing
 *   language, generic style, malformed lens phrase). Also worth a reroll.
 * - `minor` — cosmetic overrun. Only worth repairing in bulk, or when the slot
 *   set is sparse to begin with.
 *
 * Severity lives here, on the finding, because it is part of what a caller must
 * know to use this linter correctly. It used to be reconstructed downstream by
 * matching the message strings below, which made every message a load-bearing
 * contract — rewording one silently changed whether a repair ran.
 */
export type VideoPromptLintSeverity = "critical" | "quality" | "minor";

export type VideoPromptLintCode =
  | "missing_shot_framing"
  | "shot_framing_is_angle"
  | "missing_camera_angle"
  | "subject_details_required"
  | "subject_details_too_long"
  | "subject_details_look_like_action"
  | "subject_details_must_be_null"
  | "action_not_present_participle"
  | "action_too_short"
  | "action_too_long"
  | "action_comma_list"
  | "action_and_sequence"
  | "action_multiple_actions"
  | "action_secondary_verbs"
  | "style_too_generic"
  | "camera_move_not_cinematographic"
  | "camera_move_too_many_movements"
  | "camera_move_too_generic"
  | "camera_move_too_long"
  | "camera_lens_missing_aperture"
  | "camera_lens_dangling_preposition"
  | "camera_lens_too_long"
  | "viewer_language";

export interface VideoPromptLintFinding {
  code: VideoPromptLintCode;
  severity: VideoPromptLintSeverity;
  message: string;
}

export interface VideoPromptLintResult {
  ok: boolean;
  findings: VideoPromptLintFinding[];
  /**
   * Message-only projection of `findings`, in the same order. Kept because logs
   * and response metadata want prose, and deriving it here beats every caller
   * mapping it. Never branch on these strings — branch on `severity`.
   */
  errors: string[];
}

const SEVERITY_BY_CODE: Record<VideoPromptLintCode, VideoPromptLintSeverity> = {
  missing_shot_framing: "critical",
  shot_framing_is_angle: "critical",
  missing_camera_angle: "critical",
  subject_details_must_be_null: "critical",
  viewer_language: "quality",
  style_too_generic: "quality",
  action_not_present_participle: "quality",
  action_too_short: "quality",
  action_comma_list: "quality",
  action_and_sequence: "quality",
  action_multiple_actions: "quality",
  action_secondary_verbs: "quality",
  camera_lens_missing_aperture: "quality",
  camera_lens_dangling_preposition: "quality",
  camera_lens_too_long: "quality",
  subject_details_required: "minor",
  subject_details_too_long: "minor",
  subject_details_look_like_action: "minor",
  action_too_long: "minor",
  camera_move_not_cinematographic: "minor",
  camera_move_too_many_movements: "minor",
  camera_move_too_generic: "minor",
  camera_move_too_long: "minor",
};

const VIEWER_LANGUAGE = [
  /(?:the\s+)?viewer/i,
  /(?:the\s+)?audience/i,
  /\bwe\s+see\b/i,
  /\byou\s+see\b/i,
  /\binviting\b/i,
  /\bawaits?\b/i,
  /\beager(?:ly)?\b/i,
];

const GENERIC_STYLE_LANGUAGE = [
  /\bcinematic\b/i,
  /\bhigh\s+quality\b/i,
  /\bstunning\b/i,
  /\bbeautiful\b/i,
];

const MULTI_ACTION_MARKERS = [
  /\bthen\b/i,
  /;/,
  /\.\s+\w/, // multiple sentences
];

const DETERMINERS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "my",
  "your",
  "his",
  "her",
  "their",
  "our",
]);

const ALLOWED_SUBJECT_DETAIL_PREFIX = [
  /^wearing\b/i,
  /^dressed\b/i,
  /^dressed\s+in\b/i,
  /^in\s+/i, // e.g., "in a red trench coat"
];

const ALLOWED_SECONDARY_ACTION_ING = new Set([
  // State-like modifiers commonly acceptable inside one action phrase
  "carrying",
  "holding",
]);

const SECONDARY_ING_NOUNS = new Set([
  // Common nouns/adjectives ending in -ing that should not be treated as extra actions
  "building",
  "ceiling",
  "clothing",
  "morning",
  "evening",
  "lighting", // can be a noun ("the lighting") or a verb ("lighting a candle"); first-token rule handles verb case
  "blooming",
  "winding",
]);

function looksLikePresentParticipleAction(action: string): boolean {
  const firstToken = action.trim().split(/\s+/)[0] || "";
  return /ing$/i.test(firstToken);
}

function tokensMatch(left: string, right: string): boolean {
  return left.localeCompare(right) === 0;
}

function findSecondaryActionVerbs(action: string): string[] {
  const tokens = (action.toLowerCase().match(/\b[a-z']+\b/g) || []).filter(
    Boolean,
  );
  if (tokens.length <= 1) return [];

  const first = tokens[0] || "";
  const secondary: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] || "";
    if (!token.endsWith("ing")) continue;
    if (tokensMatch(token, first)) continue;
    if (ALLOWED_SECONDARY_ACTION_ING.has(token)) continue;
    if (SECONDARY_ING_NOUNS.has(token)) continue;
    const prev = tokens[i - 1] || "";
    if (DETERMINERS.has(prev)) continue; // "a building", "the winding road"

    secondary.push(token);
  }

  return secondary;
}

function collectStringFields(
  slots: Partial<VideoPromptSlots>,
): Array<{ key: keyof VideoPromptSlots; value: string }> {
  const keys: Array<keyof VideoPromptSlots> = [
    "shot_framing",
    "camera_angle",
    "camera_move",
    "subject",
    "action",
    "setting",
    "time",
    "lighting",
    "style",
  ];

  return keys
    .map((key) => ({ key, value: slots[key] }))
    .filter(
      (entry): entry is { key: keyof VideoPromptSlots; value: string } =>
        typeof entry.value === "string" && entry.value.trim().length > 0,
    )
    .map(({ key, value }) => ({ key, value: value.trim() }));
}

export function lintVideoPromptSlots(
  slots: Partial<VideoPromptSlots>,
): VideoPromptLintResult {
  const findings: VideoPromptLintFinding[] = [];
  const report = (code: VideoPromptLintCode, message: string): void => {
    findings.push({ code, severity: SEVERITY_BY_CODE[code], message });
  };

  if (!slots.shot_framing || typeof slots.shot_framing !== "string") {
    report(
      "missing_shot_framing",
      'Missing `shot_framing` (framing shot type like "Wide Shot", "Close-Up").',
    );
  } else if (/(?:angle|view|pov)/i.test(slots.shot_framing)) {
    report(
      "shot_framing_is_angle",
      "`shot_framing` looks like an angle/view; framing must be separate from camera angle.",
    );
  }

  if (!slots.camera_angle || typeof slots.camera_angle !== "string") {
    report(
      "missing_camera_angle",
      'Missing `camera_angle` (angle/viewpoint like "Low-Angle Shot", "Bird\'s-Eye View").',
    );
  }

  const subject =
    typeof slots.subject === "string" ? slots.subject.trim() : null;
  const subjectDetails = Array.isArray(slots.subject_details)
    ? slots.subject_details.filter(
        (d) => typeof d === "string" && d.trim().length > 0,
      )
    : null;

  if (subject) {
    if (!subjectDetails || subjectDetails.length < 2) {
      report(
        "subject_details_required",
        "`subject_details` must include 2-3 visible identifiers when `subject` is present.",
      );
    }
    if (subjectDetails) {
      for (const detail of subjectDetails) {
        const trimmed = detail.trim();
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount > 6) {
          report(
            "subject_details_too_long",
            `\`subject_details\` item "${trimmed}" is too long (${wordCount} words); keep 1-6 word visible identifiers.`,
          );
        }
        const startsWithIng = /^\w+ing\b/i.test(trimmed);
        const allowedPrefix = ALLOWED_SUBJECT_DETAIL_PREFIX.some((re) =>
          re.test(trimmed),
        );
        if (startsWithIng && !allowedPrefix) {
          report(
            "subject_details_look_like_action",
            `\`subject_details\` item "${trimmed}" looks like an action; keep only appearance/identifiers here.`,
          );
        }
      }
    }
  } else if (
    slots.subject_details !== null &&
    typeof slots.subject_details !== "undefined"
  ) {
    report(
      "subject_details_must_be_null",
      "If `subject` is null, `subject_details` must be null.",
    );
  }

  if (typeof slots.action === "string" && slots.action.trim().length > 0) {
    const action = slots.action.trim();
    if (!looksLikePresentParticipleAction(action)) {
      report(
        "action_not_present_participle",
        '`action` should start with a present-participle (-ing) verb phrase (e.g., "running...", "carrying...").',
      );
    }
    const actionWords = action.split(/\s+/).filter(Boolean).length;
    if (actionWords < 4) {
      report(
        "action_too_short",
        "`action` is too short; use a single verb phrase with 4-12 words.",
      );
    }
    if (actionWords > 12) {
      report(
        "action_too_long",
        "`action` is too long; keep a short single verb phrase (aim for 4-12 words).",
      );
    }
    if (action.includes(",")) {
      report(
        "action_comma_list",
        "`action` must be ONE continuous action (avoid comma-separated verb lists).",
      );
    }
    if (/\band\b/i.test(action)) {
      report(
        "action_and_sequence",
        '`action` must be ONE continuous action (avoid "and" sequences).',
      );
    }
    if (MULTI_ACTION_MARKERS.some((re) => re.test(action))) {
      report(
        "action_multiple_actions",
        "`action` looks like multiple actions or a sequence; keep one continuous action only.",
      );
    }

    const secondaryVerbs = findSecondaryActionVerbs(action);
    if (secondaryVerbs.length > 0) {
      report(
        "action_secondary_verbs",
        `\`action\` appears to contain multiple actions (extra verb(s): ${secondaryVerbs.slice(0, 3).join(", ")}). Keep ONE action.`,
      );
    }
  }

  const style = typeof slots.style === "string" ? slots.style.trim() : null;
  if (style && GENERIC_STYLE_LANGUAGE.some((re) => re.test(style))) {
    report(
      "style_too_generic",
      '`style` is too generic; avoid words like "cinematic", use film stock/genre/director references.',
    );
  }

  // Camera movement validation
  const cameraMove =
    typeof slots.camera_move === "string" ? slots.camera_move.trim() : null;
  if (cameraMove) {
    // Check for valid cinematographic vocabulary
    const validMovementTerms =
      /\b(dolly|tracking|pan|tilt|crane|jib|handheld|steadicam|whip|rack\s*focus|static|zoom|push|pull|orbit|arc|float|drift)\b/i;
    if (!validMovementTerms.test(cameraMove)) {
      report(
        "camera_move_not_cinematographic",
        "`camera_move` should use cinematographic terms (dolly, tracking, pan, crane, handheld, steadicam, rack focus, static, etc.).",
      );
    }

    // Check for multiple conflicting movements
    const movementMatches =
      cameraMove
        .toLowerCase()
        .match(/\b(dolly|pan|tilt|crane|tracking|zoom|whip|orbit)\b/gi) || [];
    if (movementMatches.length > 2) {
      report(
        "camera_move_too_many_movements",
        "`camera_move` combines too many movements; use one primary movement with optional modifier.",
      );
    }

    // Check for generic/vague terms without valid movement
    if (
      /\b(moves?|cinematic|dynamic|interesting|cool|nice)\b/i.test(
        cameraMove,
      ) &&
      !validMovementTerms.test(cameraMove)
    ) {
      report(
        "camera_move_too_generic",
        '`camera_move` is too generic; specify movement type like "slow dolly in" not "camera moves closer".',
      );
    }

    // Length check
    const moveWords = cameraMove.split(/\s+/).filter(Boolean).length;
    if (moveWords > 10) {
      report(
        "camera_move_too_long",
        "`camera_move` is too long; keep to 3-8 words describing one movement.",
      );
    }
  }

  // camera_lens validation (Sub-project C). Non-null values must contain an
  // aperture marker ("f/") or a cinematographic focal-length keyword, and
  // must not end in a dangling preposition (the "lens at," fragment pattern
  // surfaced by Sub-project D's calibration labeling).
  const cameraLens =
    typeof slots.camera_lens === "string" ? slots.camera_lens.trim() : null;
  if (cameraLens) {
    const hasAperture = cameraLens.includes("f/");
    const focalLengthOrLensKeywords =
      /\b(?:mm|prime|lens|anamorphic|telephoto|wide-angle|macro)\b/i;
    const hasFocalUnit = focalLengthOrLensKeywords.test(cameraLens);

    if (!hasAperture && !hasFocalUnit) {
      report(
        "camera_lens_missing_aperture",
        '`camera_lens` must contain aperture ("f/X") or focal-length unit (mm/prime/lens/anamorphic/telephoto/wide-angle/macro); avoid orphaned-preposition fragments.',
      );
    }

    const endsInDanglingPreposition =
      /\b(?:at|of|on|in|with|by|for)\s*[,.]?\s*$/i.test(cameraLens);
    if (endsInDanglingPreposition) {
      report(
        "camera_lens_dangling_preposition",
        '`camera_lens` ends in a dangling preposition ("at", "of", "with", etc.) with no following value; complete the aperture specification or set the slot to null.',
      );
    }

    const wordCount = cameraLens.split(/\s+/).filter(Boolean).length;
    if (wordCount > 12) {
      report(
        "camera_lens_too_long",
        "`camera_lens` is too long; keep to a single focal-length+aperture phrase (≤12 words).",
      );
    }
  }

  for (const { key, value } of collectStringFields(slots)) {
    if (VIEWER_LANGUAGE.some((re) => re.test(value))) {
      report(
        "viewer_language",
        `Field \`${key}\` contains viewer/audience language; describe only camera-visible details.`,
      );
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    errors: findings.map((finding) => finding.message),
  };
}

/**
 * Union of several lint passes over the same slots (raw + normalized), deduped
 * by message. One home for what used to be three copies — VideoStrategy's
 * `mergeLintResults`, rerollSlots' local `mergeLint`, and the inline merge in
 * the fallback path.
 */
export function mergeLintResults(
  ...results: VideoPromptLintResult[]
): VideoPromptLintResult {
  const seen = new Set<string>();
  const findings: VideoPromptLintFinding[] = [];

  for (const result of results) {
    for (const finding of result.findings) {
      // Identity, not classification: several findings legitimately share a code
      // (one per subject_details item, one per viewer-language field), so the
      // message is part of what makes a finding distinct. Nothing branches on
      // its content.
      const key = `${finding.code}::${finding.message}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      findings.push(finding);
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    errors: findings.map((finding) => finding.message),
  };
}
