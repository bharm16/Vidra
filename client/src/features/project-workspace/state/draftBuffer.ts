import { canonicalJson } from "@shared/workflow/canonicalJson";
import type { CreationDraft, DraftContent } from "@shared/schemas/workflow/draft.schemas";

export interface DraftBuffer {
  record: CreationDraft;
  content: DraftContent;
  sequence: number;
  serverRevision: number;
  checkpointSequence: number | undefined;
  acknowledgedSequence: number | undefined;
  past: DraftContent[];
  future: DraftContent[];
  typingGroup: string | undefined;
}

export function draftContent(draft: CreationDraft): DraftContent {
  return { action: draft.action, instructions: draft.instructions, inputs: draft.inputs, settings: draft.settings, context: draft.context, destination: draft.destination, ...(draft.contextualTarget ? { contextualTarget: draft.contextualTarget } : {}) };
}

interface DeviceDraftCopy { draftId: string; record: CreationDraft; serverRevision: number; content: DraftContent }

/**
 * Sorts one conversation's device copies. A copy holds unsaved work only when its words differ from the
 * server record it was saved against; hydration already restores such a copy on the current revision, and a
 * submitted or discarded draft has nothing left to recover, so its copies are settled and can be removed.
 */
export function sortDeviceCopies<T extends DeviceDraftCopy>(copies: T[], drafts: CreationDraft[], conversationId: string): { recoverable: T[]; settled: T[] } {
  const recoverable: T[] = []; const settled: T[] = [];
  for (const copy of copies) {
    if (copy.record.conversationId !== conversationId) continue;
    const saved = drafts.find(record => record.id === copy.draftId);
    if (saved && (saved.status === "submitted" || saved.status === "discarded")) { settled.push(copy); continue; }
    const unsaved = canonicalJson(copy.content) !== canonicalJson(draftContent(copy.record));
    if (!unsaved) continue;
    if (!saved || (copy.serverRevision !== saved.revision && canonicalJson(copy.content) !== canonicalJson(draftContent(saved)))) recoverable.push(copy);
  }
  return { recoverable, settled };
}

export function openDraftBuffer(record: CreationDraft): DraftBuffer {
  return { record, content: draftContent(record), sequence: 0, serverRevision: record.revision, checkpointSequence: undefined, acknowledgedSequence: 0, past: [], future: [], typingGroup: undefined };
}

export function editDraftBuffer(buffer: DraftBuffer, content: DraftContent, typingGroup?: string): DraftBuffer {
  if (buffer.record.status !== "open" && buffer.record.status !== "parked") return buffer;
  if (canonicalJson(buffer.content) === canonicalJson(content)) return buffer;
  const coalescing = typingGroup !== undefined && typingGroup === buffer.typingGroup;
  return { ...buffer, content, sequence: buffer.sequence + 1, past: coalescing ? buffer.past : [...buffer.past, buffer.content], future: [], typingGroup };
}

export function undoDraftBuffer(buffer: DraftBuffer): DraftBuffer {
  const previous = buffer.past.at(-1);
  if (!previous || (buffer.record.status !== "open" && buffer.record.status !== "parked")) return buffer;
  return { ...buffer, content: previous, sequence: buffer.sequence + 1, past: buffer.past.slice(0, -1), future: [buffer.content, ...buffer.future], typingGroup: undefined };
}

export function redoDraftBuffer(buffer: DraftBuffer): DraftBuffer {
  const next = buffer.future[0];
  if (!next || (buffer.record.status !== "open" && buffer.record.status !== "parked")) return buffer;
  return { ...buffer, content: next, sequence: buffer.sequence + 1, past: [...buffer.past, buffer.content], future: buffer.future.slice(1), typingGroup: undefined };
}

export function acknowledgeDraftBuffer(buffer: DraftBuffer, record: CreationDraft, savedSequence: number): DraftBuffer {
  if (record.id !== buffer.record.id || record.ownerId !== buffer.record.ownerId || record.revision < buffer.serverRevision) return buffer;
  const frozen = buffer.record.status === "submitted" || buffer.record.status === "discarded";
  const observed = frozen && record.status !== buffer.record.status ? buffer.record : record;
  return { ...buffer, record: observed, serverRevision: record.revision, acknowledgedSequence: Math.max(buffer.acknowledgedSequence ?? -1, Math.min(savedSequence, buffer.sequence)) };
}

export function draftHasSafeRetention(buffer: DraftBuffer): boolean {
  return buffer.checkpointSequence === buffer.sequence || buffer.acknowledgedSequence === buffer.sequence;
}

export function draftIsMeaningful(buffer: DraftBuffer, initial: DraftContent): boolean {
  return buffer.content.instructions.trim().length > 0 || buffer.content.inputs.length > 0 || canonicalJson(buffer.content) !== canonicalJson(initial);
}
