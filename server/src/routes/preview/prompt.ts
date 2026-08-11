export function stripOptimizerScaffolding(prompt: string): {
  cleaned: string;
  wasStripped: boolean;
} {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { cleaned: trimmed, wasStripped: false };
  }

  const markers: RegExp[] = [
    /\r?\n\s*\*\*\s*technical specs\s*\*\*/i,
    /\r?\n\s*\*\*\s*technical parameters\s*\*\*/i,
    /\r?\n\s*\*\*\s*alternative approaches\s*\*\*/i,
    /\r?\n\s*technical specs\s*[:\n]/i,
    /\r?\n\s*alternative approaches\s*[:\n]/i,
    /\r?\n\s*variation\s+\d+/i,
  ];

  let cutIndex = -1;
  for (const marker of markers) {
    const match = marker.exec(trimmed);
    if (match && (cutIndex === -1 || match.index < cutIndex)) {
      cutIndex = match.index;
    }
  }

  let cleaned = (cutIndex >= 0 ? trimmed.slice(0, cutIndex) : trimmed).trim();
  cleaned = cleaned
    .replace(/^\s*\*\*\s*prompt\s*:\s*\*\*/i, "")
    .replace(/^\s*prompt\s*:\s*/i, "")
    .trim();

  if (cleaned.length < 10) {
    cleaned = trimmed;
  }

  return { cleaned, wasStripped: cleaned !== trimmed };
}
