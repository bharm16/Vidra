import { z } from "zod";

/** ElevenLabs Scribe v2 output as Replicate returns it. */
const TimedTextSchema = z.object({
  text: z.string(),
  start: z.number().nullable().optional(),
  end: z.number().nullable().optional(),
});
const TranscriptWordSchema = TimedTextSchema.extend({
  type: z.string(),
  speaker_id: z.string().nullable().optional(),
  characters: z.array(TimedTextSchema).nullable().optional(),
});
export const ScribeOutputSchema = z.object({
  text: z.string(),
  language_code: z.string(),
  language_probability: z.number(),
  duration_seconds: z.number().nullable().optional(),
  words: z.array(TranscriptWordSchema).nullable().optional(),
});
type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const TimestampGranularitySchema = z.enum(["none", "word", "character"]);
export type TimestampGranularity = z.infer<typeof TimestampGranularitySchema>;

/** Text outputs are capped where request history stores them. */
export const MAX_TRANSCRIPT_CHARACTERS = 32000;

const MAX_CUE_SECONDS = 6;
const MAX_CUE_CHARACTERS = 84;
const MAX_GAP_SECONDS = 1;

function timestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor(totalMilliseconds / 60_000) % 60;
  const secs = Math.floor(totalMilliseconds / 1000) % 60;
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value: number, width = 2): string =>
    String(value).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(milliseconds, 3)}`;
}

const speakerName = (id: string): string => {
  const index = /(\d+)$/.exec(id)?.[1];
  return index === undefined ? id : `Speaker ${Number(index) + 1}`;
};

const escape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

interface Cue {
  start: number;
  end: number;
  speaker?: string;
  words: TranscriptWord[];
}

function timed<T extends { start?: number | null | undefined; end?: number | null | undefined }>(
  value: T,
): value is T & { start: number; end: number } {
  return typeof value.start === "number" && typeof value.end === "number";
}

function lastSpoken(words: TranscriptWord[]): TranscriptWord | undefined {
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    if (word && word.type !== "spacing") return word;
  }
  return undefined;
}

/** Groups timed words into readable caption cues: short, one speaker, no long pauses. */
function cues(words: TranscriptWord[]): Cue[] {
  const result: Cue[] = [];
  let current: Cue | undefined;
  let characters = 0;
  for (const word of words) {
    if (word.type === "spacing") {
      if (current) current.words.push(word);
      continue;
    }
    if (!timed(word)) continue;
    const speaker = word.speaker_id ?? undefined;
    const event = word.type === "audio_event";
    const breaks =
      !current ||
      event ||
      current.words.some((candidate) => candidate.type === "audio_event") ||
      speaker !== current.speaker ||
      word.start - current.end > MAX_GAP_SECONDS ||
      word.end - current.start > MAX_CUE_SECONDS ||
      characters + word.text.length > MAX_CUE_CHARACTERS ||
      /[.?!]$/.test(
        lastSpoken(current.words)?.text.trim() ?? "",
      );
    if (breaks) {
      current = {
        start: word.start,
        end: word.end,
        ...(speaker ? { speaker } : {}),
        words: [word],
      };
      result.push(current);
      characters = word.text.length;
    } else if (current) {
      current.words.push(word);
      current.end = Math.max(current.end, word.end);
      characters += word.text.length;
    }
  }
  return result;
}

/** Cue text with optional inline karaoke timestamps per word or per character. */
function cueText(cue: Cue, inline: TimestampGranularity): string {
  const parts: string[] = [];
  let first = true;
  for (const word of cue.words) {
    if (word.type === "spacing") {
      parts.push(" ");
      continue;
    }
    const characters = word.characters?.filter(timed) ?? [];
    if (inline === "character" && characters.length) {
      for (const character of characters) {
        parts.push(
          `${first ? "" : `<${timestamp(character.start ?? 0)}>`}${escape(character.text)}`,
        );
        first = false;
      }
    } else {
      parts.push(
        `${first || inline === "none" ? "" : `<${timestamp(word.start ?? 0)}>`}${escape(word.text)}`,
      );
      first = false;
    }
  }
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return cue.speaker ? `<v ${speakerName(cue.speaker)}>${text}` : text;
}

function webVtt(
  output: z.infer<typeof ScribeOutputSchema>,
  cueList: Cue[],
  inline: TimestampGranularity,
): string {
  const header = [
    "WEBVTT",
    "",
    `NOTE Language ${output.language_code} (${Math.round(output.language_probability * 100)}% confidence)`,
  ];
  const body = cueList.map(
    (cue) =>
      `${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cueText(cue, inline)}`,
  );
  return [...header, "", body.join("\n\n")].join("\n").trimEnd() + "\n";
}

/** Plain transcript, one paragraph per speaker turn when speakers were identified. */
function plain(output: z.infer<typeof ScribeOutputSchema>): string {
  const words = output.words ?? [];
  if (!words.some((word) => word.speaker_id)) return output.text.trim();
  const turns: Array<{ speaker?: string; text: string }> = [];
  for (const word of words) {
    const speaker = word.speaker_id ?? undefined;
    const last = turns.at(-1);
    if (!last || (word.type !== "spacing" && speaker !== last.speaker)) {
      turns.push({ ...(speaker ? { speaker } : {}), text: word.text });
    } else last.text += word.text;
  }
  return turns
    .map((turn) => ({ ...turn, text: turn.text.replace(/\s+/g, " ").trim() }))
    .filter((turn) => turn.text)
    .map((turn) => `${turn.speaker ? `${speakerName(turn.speaker)}: ` : ""}${turn.text}`)
    .join("\n\n");
}

/**
 * Formats a transcription as WebVTT captions: cues per phrase, `<v Speaker N>`
 * voice tags when speakers were identified, sound events kept as their own
 * cues, and inline karaoke timestamps at the requested granularity. Without
 * timings it returns the plain transcript. Richer timing is dropped, never the
 * words, when the result would not fit the stored text limit.
 */
export function formatTranscript(
  output: unknown,
  granularity: TimestampGranularity,
): string {
  const parsed = ScribeOutputSchema.parse(output);
  const words = parsed.words ?? [];
  const cueList = granularity === "none" ? [] : cues(words);
  const attempts: TimestampGranularity[] =
    granularity === "character"
      ? ["character", "word", "none"]
      : ["word", "none"];
  if (cueList.length) {
    for (const inline of attempts) {
      const vtt = webVtt(parsed, cueList, inline);
      if (vtt.length <= MAX_TRANSCRIPT_CHARACTERS) return vtt;
    }
  }
  return plain(parsed).slice(0, MAX_TRANSCRIPT_CHARACTERS);
}
