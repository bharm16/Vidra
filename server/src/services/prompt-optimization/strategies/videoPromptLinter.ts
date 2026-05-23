import type { VideoPromptSlots } from "./videoPromptTypes.js";

export interface VideoPromptLintResult {
  ok: boolean;
  errors: string[];
}

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
  const errors: string[] = [];

  if (!slots.shot_framing || typeof slots.shot_framing !== "string") {
    errors.push(
      'Missing `shot_framing` (framing shot type like "Wide Shot", "Close-Up").',
    );
  } else if (/(?:angle|view|pov)/i.test(slots.shot_framing)) {
    errors.push(
      "`shot_framing` looks like an angle/view; framing must be separate from camera angle.",
    );
  }

  if (!slots.camera_angle || typeof slots.camera_angle !== "string") {
    errors.push(
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
      errors.push(
        "`subject_details` must include 2-3 visible identifiers when `subject` is present.",
      );
    }
    if (subjectDetails) {
      for (const detail of subjectDetails) {
        const trimmed = detail.trim();
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount > 6) {
          errors.push(
            `\`subject_details\` item "${trimmed}" is too long (${wordCount} words); keep 1-6 word visible identifiers.`,
          );
        }
        const startsWithIng = /^\w+ing\b/i.test(trimmed);
        const allowedPrefix = ALLOWED_SUBJECT_DETAIL_PREFIX.some((re) =>
          re.test(trimmed),
        );
        if (startsWithIng && !allowedPrefix) {
          errors.push(
            `\`subject_details\` item "${trimmed}" looks like an action; keep only appearance/identifiers here.`,
          );
        }
      }
    }
  } else if (
    slots.subject_details !== null &&
    typeof slots.subject_details !== "undefined"
  ) {
    errors.push("If `subject` is null, `subject_details` must be null.");
  }

  if (typeof slots.action === "string" && slots.action.trim().length > 0) {
    const action = slots.action.trim();
    if (!looksLikePresentParticipleAction(action)) {
      errors.push(
        '`action` should start with a present-participle (-ing) verb phrase (e.g., "running...", "carrying...").',
      );
    }
    const actionWords = action.split(/\s+/).filter(Boolean).length;
    if (actionWords < 4) {
      errors.push(
        "`action` is too short; use a single verb phrase with 4-12 words.",
      );
    }
    if (actionWords > 12) {
      errors.push(
        "`action` is too long; keep a short single verb phrase (aim for 4-12 words).",
      );
    }
    if (action.includes(",")) {
      errors.push(
        "`action` must be ONE continuous action (avoid comma-separated verb lists).",
      );
    }
    if (/\band\b/i.test(action)) {
      errors.push(
        '`action` must be ONE continuous action (avoid "and" sequences).',
      );
    }
    if (MULTI_ACTION_MARKERS.some((re) => re.test(action))) {
      errors.push(
        "`action` looks like multiple actions or a sequence; keep one continuous action only.",
      );
    }

    const secondaryVerbs = findSecondaryActionVerbs(action);
    if (secondaryVerbs.length > 0) {
      errors.push(
        `\`action\` appears to contain multiple actions (extra verb(s): ${secondaryVerbs.slice(0, 3).join(", ")}). Keep ONE action.`,
      );
    }
  }

  const style = typeof slots.style === "string" ? slots.style.trim() : null;
  if (style && GENERIC_STYLE_LANGUAGE.some((re) => re.test(style))) {
    errors.push(
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
      errors.push(
        "`camera_move` should use cinematographic terms (dolly, tracking, pan, crane, handheld, steadicam, rack focus, static, etc.).",
      );
    }

    // Check for multiple conflicting movements
    const movementMatches =
      cameraMove
        .toLowerCase()
        .match(/\b(dolly|pan|tilt|crane|tracking|zoom|whip|orbit)\b/gi) || [];
    if (movementMatches.length > 2) {
      errors.push(
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
      errors.push(
        '`camera_move` is too generic; specify movement type like "slow dolly in" not "camera moves closer".',
      );
    }

    // Length check
    const moveWords = cameraMove.split(/\s+/).filter(Boolean).length;
    if (moveWords > 10) {
      errors.push(
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
      errors.push(
        '`camera_lens` must contain aperture ("f/X") or focal-length unit (mm/prime/lens/anamorphic/telephoto/wide-angle/macro); avoid orphaned-preposition fragments.',
      );
    }

    const endsInDanglingPreposition =
      /\b(?:at|of|on|in|with|by|for)\s*[,.]?\s*$/i.test(cameraLens);
    if (endsInDanglingPreposition) {
      errors.push(
        '`camera_lens` ends in a dangling preposition ("at", "of", "with", etc.) with no following value; complete the aperture specification or set the slot to null.',
      );
    }

    const wordCount = cameraLens.split(/\s+/).filter(Boolean).length;
    if (wordCount > 12) {
      errors.push(
        "`camera_lens` is too long; keep to a single focal-length+aperture phrase (≤12 words).",
      );
    }
  }

  for (const { key, value } of collectStringFields(slots)) {
    if (VIEWER_LANGUAGE.some((re) => re.test(value))) {
      errors.push(
        `Field \`${key}\` contains viewer/audience language; describe only camera-visible details.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
