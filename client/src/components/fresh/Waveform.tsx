import "./fresh.css";
import { useEffect, useState, type ReactElement } from "react";

const peaksByUrl = new Map<string, Promise<number[] | undefined>>();

/** Loudness of the take in `bars` buckets, decoded once per URL; undefined when the browser cannot decode it. */
async function decodePeaks(url: string, bars: number): Promise<number[] | undefined> {
  const AudioContextClass = typeof window === "undefined" ? undefined : window.AudioContext;
  if (!AudioContextClass) return undefined;
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const context = new AudioContextClass();
  try {
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    const samples = audio.getChannelData(0);
    const size = Math.max(1, Math.floor(samples.length / bars));
    const peaks = Array.from({ length: bars }, (_, bar) => {
      let peak = 0;
      for (let index = bar * size; index < Math.min(samples.length, (bar + 1) * size); index += 16) peak = Math.max(peak, Math.abs(samples[index] ?? 0));
      return peak;
    });
    const loudest = Math.max(...peaks, 0.0001);
    return peaks.map(peak => peak / loudest);
  } finally { void context.close(); }
}

/** Real peaks for a take; a quiet even glyph while they load or when they cannot be read. */
export function useAudioPeaks(url: string | undefined, bars: number): number[] | undefined {
  const [peaks, setPeaks] = useState<number[]>();
  useEffect(() => {
    if (!url) { setPeaks(undefined); return; }
    let current = true;
    const key = `${bars}:${url}`;
    const pending = peaksByUrl.get(key) ?? decodePeaks(url, bars).catch(() => undefined);
    peaksByUrl.set(key, pending);
    void pending.then(result => { if (current) setPeaks(result); });
    return () => { current = false; };
  }, [url, bars]);
  return peaks;
}

/** Bars for audio (S9): played bars read bright, the rest muted. */
export function Waveform({ peaks, bars, progress = 0, className = "" }: { peaks: number[] | undefined; bars: number; progress?: number; className?: string }): ReactElement {
  const heights = peaks ?? Array.from({ length: bars }, (_, index) => 0.35 + 0.25 * Math.abs(Math.sin(index * 1.7)) + 0.2 * Math.abs(Math.sin(index * 0.53)));
  return <span className={`vf-waveform ${className}`} aria-hidden="true">{heights.map((height, index) => <span key={index} data-played={index / heights.length < progress || undefined} style={{ height: `${Math.max(12, Math.round(height * 100))}%` }} />)}</span>;
}
