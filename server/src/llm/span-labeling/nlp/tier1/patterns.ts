import type { NlpSpan } from "../types";

const COMMON_ASPECT_RATIOS = new Set([
  "1:1",
  "4:3",
  "3:2",
  "16:9",
  "9:16",
  "4:5",
  "2:3",
  "21:9",
  "1.33:1",
  "1.37:1",
  "1.43:1",
  "1.66:1",
  "1.75:1",
  "1.85:1",
  "2.00:1",
  "2.20:1",
  "2.35:1",
  "2.39:1",
  "2.40:1",
  "2.55:1",
  "2.59:1",
  "2.76:1",
]);

function isLikelyAspectRatio(
  text: string,
  start: number,
  end: number,
): boolean {
  const raw = text.slice(start, end);
  const normalized = raw.replace(/\s+/g, "");

  if (COMMON_ASPECT_RATIOS.has(normalized)) {
    return true;
  }

  const windowStart = Math.max(0, start - 30);
  const windowEnd = Math.min(text.length, end + 30);
  const context = text.slice(windowStart, windowEnd).toLowerCase();
  return context.includes("aspect") || context.includes("ratio");
}

const PATTERN_DEFINITIONS: Array<{
  role: string;
  regex: RegExp;
  confidence: number;
  context?: (text: string, start: number, end: number) => boolean;
}> = [
  {
    role: "technical.frameRate",
    regex: /\b\d{2,3}(?:\.\d{1,2})?\s*fps\b/gi,
    confidence: 0.95,
  },
  {
    role: "technical.duration",
    regex: /\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds)\b/gi,
    confidence: 0.9,
  },
  {
    role: "technical.duration",
    regex: /\b\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds)\b/gi,
    confidence: 0.9,
  },
  {
    role: "technical.resolution",
    regex: /\b\d{3,4}p\b/gi,
    confidence: 0.9,
  },
  {
    role: "technical.resolution",
    regex: /\b[248]k\b/gi,
    confidence: 0.9,
  },
  {
    role: "technical.aspectRatio",
    regex: /\b\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?\b/g,
    confidence: 0.9,
    context: isLikelyAspectRatio,
  },
  {
    role: "camera.lens",
    regex: /\b\d{2,3}\s*mm\b/gi,
    confidence: 0.9,
  },
  {
    role: "camera.focus",
    // Each optional second-number prefix starts with a literal. Keeping the
    // slash-present and slash-absent forms separate prevents several \s*
    // groups from repartitioning one failed whitespace run.
    regex: /\bf\s*\/\s*\d+(?:\.\d+)?\s*-\s*(?:f\s*\/\s*|f\s*|\/\s*)?\d+(?:\.\d+)?\b/gi,
    confidence: 0.9,
  },
  {
    role: "camera.focus",
    regex: /\bf\s*\/\s*\d+(?:\.\d+)?\b/gi,
    confidence: 0.9,
  },
  {
    role: "lighting.colorTemp",
    regex: /\b\d{4,5}\s*k\b/gi,
    confidence: 0.85,
  },
];

export function extractPatternSpans(text: string): NlpSpan[] {
  const spans: NlpSpan[] = [];

  for (const pattern of PATTERN_DEFINITIONS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const matchedText = match[0];
      const start = match.index;
      const end = start + matchedText.length;

      if (pattern.context && !pattern.context(text, start, end)) {
        continue;
      }

      spans.push({
        text: matchedText,
        role: pattern.role,
        confidence: pattern.confidence,
        start,
        end,
        source: "pattern",
      });
    }
  }

  return spans;
}
