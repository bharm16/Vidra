import type { VideoPromptSlots } from "./videoPromptTypes.js";
import { normalizeShotFraming } from "./videoPromptTypes.js";

function clean(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function ensurePeriod(sentence: string): string {
  const trimmed = sentence.trim();
  if (!trimmed) return trimmed;
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function formatList(items: string[]): string {
  const cleaned = items.map((d) => d.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function ensureIndefiniteArticle(nounPhrase: string): string {
  const trimmed = nounPhrase.trim();
  if (!trimmed) return trimmed;

  if (
    /^(?:a|an|the|this|that|these|those|my|your|his|her|their|our)\b/i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  // If it looks like a proper noun ("John", "NASA") don't force an article.
  if (/^[A-Z]/.test(trimmed)) {
    return trimmed;
  }

  const firstLetter = trimmed[0]?.toLowerCase() || "";
  const article = ["a", "e", "i", "o", "u"].includes(firstLetter) ? "an" : "a";
  return `${article} ${trimmed}`;
}

function ensureSettingPhrase(setting: string): string {
  const trimmed = setting.trim();
  if (!trimmed) return trimmed;

  // If it already contains a leading preposition/determiner, leave it alone.
  if (
    /^(?:a|an|the|this|that|these|those|my|your|his|her|their|our)\b/i.test(
      trimmed,
    )
  )
    return trimmed;
  if (
    /^(?:in|at|on|inside|outside|under|over|near|by|behind|beside|within|along|across)\b/i.test(
      trimmed,
    )
  )
    return trimmed;

  // If the phrase ends with a capitalized word ("Times Square", "Manhattan"), treat it as a proper location.
  if (/\b[A-Z][\w-]*$/.test(trimmed)) return trimmed;

  return ensureIndefiniteArticle(trimmed);
}

function ensureTimePhrase(time: string): string {
  const trimmed = time.trim();
  if (!trimmed) return trimmed;
  if (/^(?:at|in|during|before|after|as|while)\b/i.test(trimmed))
    return trimmed;
  return `at ${trimmed}`;
}

function angleToPhrase(cameraAngle: string | null): string | null {
  const angle = clean(cameraAngle);
  if (!angle) return null;

  switch (angle) {
    case "Low-Angle Shot":
      return "from a low angle";
    case "High-Angle Shot":
      return "from a high angle";
    case "Eye-Level Shot":
      return "at eye level";
    case "Bird's-Eye View":
      return "from a bird's-eye view";
    case "Worm's-Eye View":
      return "from a worm's-eye view";
    case "Dutch Angle":
      return "at a Dutch angle";
    case "POV Shot":
      return "in a POV shot";
    case "Over-the-Shoulder":
      return "over-the-shoulder";
    default:
      return angle.toLowerCase();
  }
}

function focusFromFraming(shotFraming: string | null): string | null {
  const framing = clean(shotFraming);
  if (!framing) return null;
  if (/(?:wide|establishing)/i.test(framing)) return "deep focus";
  if (/(?:close-up|macro)/i.test(framing)) return "shallow depth of field";
  return "selective focus";
}

function actionIsPresentParticiple(action: string): boolean {
  const first = action.trim().split(/\s+/)[0] || "";
  return /ing$/i.test(first);
}

function formatSubject(
  subject: string | null,
  details: string[] | null,
): string | null {
  const rawSubject = clean(subject);
  if (!rawSubject) return null;

  const cleanedDetails = (details || [])
    .map((d) => clean(d))
    .filter((d): d is string => typeof d === "string" && d.length > 0);
  const safeSubject = ensureIndefiniteArticle(rawSubject);

  if (cleanedDetails.length === 0) return safeSubject;

  // Handle "wearing..." / "dressed in..." details without producing "with wearing..."
  const clothingIndex = cleanedDetails.findIndex((d) =>
    /^(?:wearing\b|dressed\b|dressed\s+in\b|in\s+)/i.test(d),
  );
  const clothingPhrase =
    clothingIndex >= 0 ? cleanedDetails.splice(clothingIndex, 1)[0] : null;

  const isActionLikeDetail = (detail: string): boolean => {
    const firstToken = detail.trim().split(/\s+/)[0]?.toLowerCase() || "";
    if (!firstToken.endsWith("ing")) return false;
    // Appearance phrasing (already handled above) shouldn't be treated as an action clause.
    if (firstToken === "wearing" || firstToken === "dressed") return false;
    return true;
  };

  const attributeDetails = cleanedDetails.filter((d) => !isActionLikeDetail(d));
  const actionLikeDetails = cleanedDetails.filter(isActionLikeDetail);

  const parts: string[] = [safeSubject];
  if (clothingPhrase) parts.push(clothingPhrase);
  if (attributeDetails.length > 0)
    parts.push(`with ${formatList(attributeDetails)}`);
  if (actionLikeDetails.length > 0)
    parts.push(`and ${formatList(actionLikeDetails)}`);
  return parts.join(" ");
}

function formatSettingTime(
  setting: string | null,
  time: string | null,
): string | null {
  const s = clean(setting);
  const t = clean(time);
  if (s && t) return `in ${ensureSettingPhrase(s)} ${ensureTimePhrase(t)}`;
  if (s) return `in ${ensureSettingPhrase(s)}`;
  if (t) return ensureTimePhrase(t);
  return null;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsWord(text: string, word: string): boolean {
  const re = new RegExp(`\\b${word}s?\\b`, "i");
  return re.test(text);
}

function stripAnchorPhrase(text: string, anchor: string): string {
  // Remove simple redundant modifiers like ", with a window" / "by the window" / "near a window"
  const re = new RegExp(
    `\\s*(?:,|and)?\\s*(?:with|near|by|beside|next\\s+to)\\s+(?:a|an|the)\\s+${anchor}s?\\b`,
    "gi",
  );
  return text.replace(re, "").replace(/\s+/g, " ").trim();
}

function shortenToFirstClause(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return cleaned;
  const parts = cleaned.split(/[,;]+/);
  return (parts[0] || cleaned).trim();
}

function compactToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}.`;
}

export function renderMainVideoPrompt(slots: VideoPromptSlots): string {
  const shotFraming = normalizeShotFraming(clean(slots.shot_framing));
  const anglePhrase = angleToPhrase(slots.camera_angle);
  const cameraMove = clean(slots.camera_move);
  const subjectPhrase = formatSubject(slots.subject, slots.subject_details);
  let action = clean(slots.action);
  let setting = clean(slots.setting);
  const time = clean(slots.time);

  const focus = focusFromFraming(shotFraming);
  const lighting = clean(slots.lighting);
  const style = clean(slots.style);

  // Reduce obvious redundancy across slots (e.g., "window" repeated in setting + lighting + action).
  const anchors = ["window", "door", "street", "park", "alley", "beach"];
  for (const anchor of anchors) {
    if (!anchor) continue;
    const inSetting = setting ? containsWord(setting, anchor) : false;
    const inLighting = lighting ? containsWord(lighting, anchor) : false;
    const inAction = action ? containsWord(action, anchor) : false;

    if (setting && inSetting && inLighting) {
      setting = stripAnchorPhrase(setting, anchor);
    }
    if (action && inAction && inSetting) {
      const stripped = stripAnchorPhrase(action, anchor);
      if (stripped && /^\w+ing\b/i.test(stripped)) action = stripped;
    }
  }

  const settingTime = formatSettingTime(setting, time);

  const firstSentenceParts: string[] = [];
  firstSentenceParts.push(`${shotFraming}`);
  firstSentenceParts.push(`of ${subjectPhrase || "the scene"}`);
  if (action) {
    if (
      actionIsPresentParticiple(action) ||
      /\bas it\b/i.test(action) ||
      /\bwhile\b/i.test(action)
    ) {
      firstSentenceParts.push(action);
    } else {
      firstSentenceParts.push(`as it ${action}`);
    }
  }
  if (settingTime) firstSentenceParts.push(settingTime);
  const sentence1 = ensurePeriod(firstSentenceParts.join(" "));

  const cameraLens = clean(slots.camera_lens);

  const sentence2Parts: string[] = [];
  if (cameraMove) {
    sentence2Parts.push(
      `The camera uses ${cameraMove}${anglePhrase ? ` ${anglePhrase}` : ""}`,
    );
  } else if (anglePhrase) {
    sentence2Parts.push(`The camera holds ${anglePhrase}`);
  }

  if (cameraLens) {
    // LLM-provided lens wins; hardcoded focusFromFraming fallback is suppressed
    // to eliminate the aperture duplication that produced "lens at," fragments
    // (Sub-project C, 2026-05-22-optimize-camera-lens-slot-design.md).
    sentence2Parts.push(`on ${cameraLens}`);
  } else if (focus) {
    if (focus === "deep focus") {
      sentence2Parts.push(
        "with deep focus (f/11-f/16) to keep background detail readable",
      );
    } else if (focus === "shallow depth of field") {
      sentence2Parts.push(
        "with shallow depth of field (f/1.8-f/2.8) to isolate the main subject",
      );
    } else {
      sentence2Parts.push(
        "with selective focus (f/4-f/5.6) to guide attention to the main action",
      );
    }
  }
  const sentence2 = ensurePeriod(
    sentence2Parts.join(" ").trim().replace(/\s+/g, " "),
  );

  const sentence3 = lighting ? ensurePeriod(`Lit by ${lighting}`) : "";
  const sentence4 = style ? ensurePeriod(`Style reference: ${style}`) : "";

  const paragraph = [sentence1, sentence2, sentence3, sentence4]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Short prompts are fine - modern video models (Sora 2, Runway Gen 4.5) prefer
  // concrete visual descriptions over padding with meta-instructions.
  // Removed: "maintain consistent framing and subject continuity" - this is an
  // abstract meta-instruction, not a visual control point.
  return paragraph;
}

export function renderCompactVideoPrompt(
  slots: VideoPromptSlots,
  options: {
    maxWords?: number;
    require?: Array<"camera" | "lighting" | "style">;
  } = {},
): string {
  const maxWords = options.maxWords ?? 50;
  const require = new Set(options.require ?? []);

  const shotFraming = clean(slots.shot_framing) ?? "Wide Shot";
  const anglePhrase = angleToPhrase(slots.camera_angle);
  const cameraMove = clean(slots.camera_move);
  const cameraLens = clean(slots.camera_lens);

  const subjectPhrase = formatSubject(
    slots.subject,
    (slots.subject_details || []).slice(0, 2),
  );
  const action = clean(slots.action);
  const settingTime = formatSettingTime(
    clean(slots.setting),
    clean(slots.time),
  );
  const lighting = clean(slots.lighting);
  const style = clean(slots.style);

  const baseParts: string[] = [];
  baseParts.push(`${shotFraming}`);
  baseParts.push(`of ${subjectPhrase || "the scene"}`);
  if (action) {
    baseParts.push(
      actionIsPresentParticiple(action) ? action : `as it ${action}`,
    );
  }
  if (settingTime) baseParts.push(settingTime);
  let text = ensurePeriod(baseParts.join(" "));

  const cameraSentence = (() => {
    if (!cameraMove && !anglePhrase && !cameraLens) return null;
    const parts: string[] = [];
    if (cameraMove && anglePhrase) {
      parts.push(`The camera uses ${cameraMove} ${anglePhrase}`);
    } else if (cameraMove) {
      parts.push(`The camera uses ${cameraMove}`);
    } else if (anglePhrase) {
      parts.push(`The camera holds ${anglePhrase}`);
    }
    if (cameraLens) {
      parts.push(`on ${cameraLens}`);
    }
    return parts.length > 0 ? ensurePeriod(parts.join(" ")) : null;
  })();

  const lightingSentence = lighting
    ? ensurePeriod(`Lit by ${shortenToFirstClause(lighting)}`)
    : null;
  const styleSentence = style
    ? ensurePeriod(`Style reference: ${shortenToFirstClause(style)}`)
    : null;

  // Add required sections first.
  const ordered: Array<{
    key: "camera" | "lighting" | "style";
    sentence: string | null;
  }> = [
    { key: "camera", sentence: cameraSentence },
    { key: "lighting", sentence: lightingSentence },
    { key: "style", sentence: styleSentence },
  ];

  for (const item of ordered) {
    if (!item.sentence) continue;
    if (!require.has(item.key)) continue;
    text = `${text} ${item.sentence}`.trim();
  }

  // Then add optional sections if they fit.
  for (const item of ordered) {
    if (!item.sentence) continue;
    if (require.has(item.key)) continue;
    const candidate = `${text} ${item.sentence}`.trim();
    if (countWords(candidate) <= maxWords) {
      text = candidate;
    }
  }

  return compactToWordLimit(text, maxWords);
}

export function renderPreviewPrompt(slots: VideoPromptSlots): string {
  const shotFraming = clean(slots.shot_framing) ?? "Wide Shot";
  const anglePhrase = angleToPhrase(slots.camera_angle);
  const cameraLens = clean(slots.camera_lens);
  const subjectPhrase = formatSubject(
    slots.subject,
    (slots.subject_details || []).slice(0, 2),
  );
  const action = clean(slots.action);
  const settingTime = formatSettingTime(
    clean(slots.setting),
    clean(slots.time),
  );
  const lighting = clean(slots.lighting);
  const style = clean(slots.style);

  const baseParts: string[] = [];
  baseParts.push(shotFraming);
  if (anglePhrase) baseParts.push(anglePhrase);
  baseParts.push(`of ${subjectPhrase || "the scene"}`);
  if (action) {
    baseParts.push(
      actionIsPresentParticiple(action) ? action : `as it ${action}`,
    );
  }
  if (settingTime) baseParts.push(settingTime);
  let text = ensurePeriod(baseParts.join(" ").replace(/\s+/g, " ").trim());

  if (cameraLens) {
    text = `${text} ${ensurePeriod(`on ${cameraLens}`)}`.trim();
  }

  const lightingSentence = lighting
    ? ensurePeriod(`Lit by ${shortenToFirstClause(lighting)}`)
    : null;
  const styleSentence = style
    ? ensurePeriod(`Style reference: ${shortenToFirstClause(style)}`)
    : null;

  if (lightingSentence) text = `${text} ${lightingSentence}`.trim();
  if (styleSentence) text = `${text} ${styleSentence}`.trim();

  text = `${text} Single keyframe with crisp detail.`.trim();

  return compactToWordLimit(text, 60);
}

function pickAlternativeAngle(current: string): string {
  const angle = clean(current) ?? "Eye-Level Shot";
  const options = [
    "Bird's-Eye View",
    "Worm's-Eye View",
    "Dutch Angle",
    "Eye-Level Shot",
    "Low-Angle Shot",
    "High-Angle Shot",
    "POV Shot",
  ].filter((a) => a !== angle);
  return options[0] || "Eye-Level Shot";
}

export function renderAlternativeApproaches(
  slots: VideoPromptSlots,
): Array<{ label: string; prompt: string }> {
  const altAngleSlots: VideoPromptSlots = {
    ...slots,
    camera_angle: pickAlternativeAngle(slots.camera_angle),
  };
  const altAngle = renderCompactVideoPrompt(altAngleSlots, {
    maxWords: 50,
    require: ["camera"],
  });

  const altLightingSlots: VideoPromptSlots = {
    ...slots,
    lighting:
      slots.lighting && /low-key/i.test(slots.lighting)
        ? "bright, high-key daylight from a large window as the key light, soft fill to reduce harsh shadows"
        : "low-key lighting with a single warm key light from the side, minimal fill, and deep shadows",
  };
  const altLighting = renderCompactVideoPrompt(altLightingSlots, {
    maxWords: 50,
    require: ["lighting"],
  });

  return [
    { label: "Different Camera", prompt: altAngle },
    { label: "Different Lighting", prompt: altLighting },
  ];
}
