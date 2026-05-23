import type { VideoPromptSlots } from "@services/prompt-optimization/strategies/videoPromptTypes";

export function normalizeSlots(
  raw: Partial<VideoPromptSlots>,
): VideoPromptSlots {
  const normalizeStringOrNull = (value: unknown): string | null => {
    if (value === null || typeof value === "undefined") return null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizeString = (value: unknown, fallback: string): string => {
    const normalized = normalizeStringOrNull(value);
    return normalized ?? fallback;
  };

  const normalizeStringArrayOrNull = (value: unknown): string[] | null => {
    if (value === null || typeof value === "undefined") return null;
    if (!Array.isArray(value)) return null;
    const rawItems = value.filter(
      (item) => typeof item === "string",
    ) as string[];

    const expanded = rawItems.flatMap((item) =>
      item
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );

    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const item of expanded) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    const cleaned = deduped.slice(0, 3);
    return cleaned.length > 0 ? cleaned : null;
  };

  const subject = normalizeStringOrNull(raw.subject);
  let subjectDetails = subject
    ? normalizeStringArrayOrNull(raw.subject_details)
    : null;

  if (subjectDetails) {
    const generic = new Set([
      "main subject",
      "subject",
      "the subject",
      "person",
    ]);
    subjectDetails = subjectDetails.filter(
      (d) => !generic.has(d.trim().toLowerCase()),
    );
    if (subjectDetails.length === 0) subjectDetails = null;
  }

  let action = normalizeStringOrNull(raw.action);

  if (subject && subjectDetails) {
    const looksLikeActionDetail = (detail: string): boolean => {
      const firstToken = detail.trim().split(/\s+/)[0]?.toLowerCase() || "";
      if (!firstToken.endsWith("ing")) return false;
      if (firstToken === "wearing" || firstToken === "dressed") return false;
      return true;
    };

    const actionLikeIndices = subjectDetails
      .map((detail, idx) => (looksLikeActionDetail(detail) ? idx : -1))
      .filter((idx) => idx >= 0);

    if (!action && actionLikeIndices.length > 0) {
      const idx = actionLikeIndices[0]!;
      action = subjectDetails[idx] || null;
      subjectDetails = subjectDetails.filter((_, i) => i !== idx);
    }

    if (action && subjectDetails) {
      subjectDetails = subjectDetails.filter((d) => !looksLikeActionDetail(d));
    }

    if (subjectDetails && subjectDetails.length === 0) subjectDetails = null;
  }

  if (subjectDetails) {
    const normalizedDetails = subjectDetails
      .map((d) => d.trim().replace(/\s+/g, " "))
      .map((d) => d.replace(/^[-*\u2022]\s+/, ""))
      .map((d) => d.replace(/^(?:and|with)\s+/i, ""))
      .map((d) => d.replace(/[.]+$/g, "").trim())
      .map((d) => {
        const words = d.split(/\s+/).filter(Boolean);
        return words.length > 6 ? words.slice(0, 6).join(" ") : d;
      })
      .filter(Boolean);

    const seen = new Set<string>();
    subjectDetails = normalizedDetails.filter((d) => {
      const key = d.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    subjectDetails =
      subjectDetails.length > 0 ? subjectDetails.slice(0, 3) : null;
  }

  return {
    shot_framing: normalizeString(raw.shot_framing, "Wide Shot"),
    camera_angle: normalizeString(raw.camera_angle, "Eye-Level Shot"),
    camera_move: normalizeStringOrNull(raw.camera_move),
    camera_lens: normalizeStringOrNull(raw.camera_lens),
    subject,
    subject_details: subjectDetails,
    action,
    setting: normalizeStringOrNull(raw.setting),
    time: normalizeStringOrNull(raw.time),
    lighting: normalizeStringOrNull(raw.lighting),
    style: normalizeStringOrNull(raw.style),
  };
}
