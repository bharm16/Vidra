export interface PhraseDraft {
  id: string;
  sequence: number;
  contextKey: string;
  instructions: string;
  writable: boolean;
}
export interface PhraseBinding {
  draftId: string;
  sequence: number;
  contextKey: string;
  sourceText: string;
  start: number;
  end: number;
  text: string;
}
export type PhraseRejection = "read-only" | "draft-changed" | "context-changed" | "stale" | "missing" | "ambiguous" | "invalid-range";
export type PhraseApplication = { state: "applied"; instructions: string } | { state: "rejected"; reason: PhraseRejection };
export type PhraseReview = { state: "reviewable"; binding: PhraseBinding } | { state: "rejected"; reason: PhraseRejection };

function validRange(text: string, start: number, end: number): boolean {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return false;
  const boundaries = new Set([0, text.length]);
  for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) boundaries.add(segment.index);
  return boundaries.has(start) && boundaries.has(end) && text.slice(start, end).trim().length > 0;
}

/** Capture one exact occurrence in one writable draft, using UTF-16 DOM offsets. */
export function bindPhrase(draft: PhraseDraft, start: number, end: number): PhraseBinding {
  if (!validRange(draft.instructions, start, end)) throw new Error("Select complete characters in the current words.");
  return { draftId: draft.id, sequence: draft.sequence, contextKey: draft.contextKey, sourceText: draft.instructions, start, end, text: draft.instructions.slice(start, end) };
}

function scopeRejection(draft: PhraseDraft, binding: PhraseBinding): PhraseRejection | undefined {
  if (!draft.writable) return "read-only";
  if (draft.id !== binding.draftId) return "draft-changed";
  if (draft.contextKey !== binding.contextKey) return "context-changed";
  return undefined;
}

/** Successful application returns new words; the caller commits one undoable edit. */
export function applyPhraseChange(draft: PhraseDraft, binding: PhraseBinding, replacement: string): PhraseApplication {
  const rejection = scopeRejection(draft, binding);
  if (rejection) return { state: "rejected", reason: rejection };
  if (draft.sequence !== binding.sequence || draft.instructions !== binding.sourceText) return { state: "rejected", reason: "stale" };
  if (!validRange(draft.instructions, binding.start, binding.end)) return { state: "rejected", reason: "invalid-range" };
  if (draft.instructions.slice(binding.start, binding.end) !== binding.text) return { state: "rejected", reason: "missing" };
  return { state: "applied", instructions: draft.instructions.slice(0, binding.start) + replacement + draft.instructions.slice(binding.end) };
}

/** Build a current-draft review; it never applies or guesses an ambiguous target. */
export function reviewPhraseChange(draft: PhraseDraft, binding: PhraseBinding): PhraseReview {
  const rejection = scopeRejection(draft, binding);
  if (rejection) return { state: "rejected", reason: rejection };
  const matches: number[] = [];
  for (let from = 0; from <= draft.instructions.length;) {
    const start = draft.instructions.indexOf(binding.text, from);
    if (start < 0) break;
    if (validRange(draft.instructions, start, start + binding.text.length)) matches.push(start);
    from = start + Math.max(1, binding.text.length);
  }
  if (!matches.length) return { state: "rejected", reason: "missing" };
  let candidates = matches;
  if (matches.length > 1) {
    const before = binding.sourceText.slice(Math.max(0, binding.start - 40), binding.start);
    const after = binding.sourceText.slice(binding.end, binding.end + 40);
    candidates = matches.filter(start => draft.instructions.slice(Math.max(0, start - before.length), start) === before && draft.instructions.slice(start + binding.text.length, start + binding.text.length + after.length) === after);
  }
  if (candidates.length !== 1 || candidates[0] === undefined) return { state: "rejected", reason: "ambiguous" };
  return { state: "reviewable", binding: bindPhrase(draft, candidates[0], candidates[0] + binding.text.length) };
}
