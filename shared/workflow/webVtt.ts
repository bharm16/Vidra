export interface CaptionCue {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

function seconds(stamp: string): number | undefined {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(stamp.trim());
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

/** Caption cues from a WebVTT transcript; plain transcripts (Timing None) are not captions. */
export function parseWebVtt(text: string): CaptionCue[] | undefined {
  if (!text.trimStart().startsWith("WEBVTT")) return undefined;
  const cues: CaptionCue[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n").filter(line => line.trim());
    const timing = lines.findIndex(line => line.includes("-->"));
    if (timing < 0) continue;
    const [from = "", to = ""] = lines[timing]?.split("-->") ?? [];
    const start = seconds(from);
    const end = seconds(to.trim().split(/\s+/)[0] ?? "");
    if (start === undefined || end === undefined) continue;
    let body = lines.slice(timing + 1).join(" ");
    const voice = /^<v\s+([^>]+)>/.exec(body);
    if (voice) body = body.slice(voice[0].length);
    // Inline word timings and closing voice tags are not words.
    body = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    cues.push({ start, end, ...(voice?.[1] ? { speaker: voice[1].trim() } : {}), text: body });
  }
  return cues;
}

export function cueTime(value: number): string {
  const whole = Math.max(0, Math.floor(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
