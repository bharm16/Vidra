import type { CreationDraft, DraftContent } from "@shared/schemas/workflow/draft.schemas";
import type { DraftBuffer } from "./draftBuffer";

/** Read-only authoring facts; persistence sequence arithmetic stays in the authoring implementation. */
export interface AuthoringDraft {
  readonly record: CreationDraft;
  readonly content: DraftContent;
  readonly sequence: number;
  readonly retention: { safe: boolean; onDevice: boolean; onServer: boolean; deviceError?: string | undefined; serverError?: string | undefined };
}
export function authoringDraft(buffer: DraftBuffer, errors: { device?: string | undefined; server?: string | undefined } = {}): AuthoringDraft {
  const onDevice = buffer.checkpointSequence === buffer.sequence;
  const onServer = buffer.acknowledgedSequence === buffer.sequence;
  return { record: buffer.record, content: buffer.content, sequence: buffer.sequence, retention: { safe: onDevice || onServer, onDevice, onServer, deviceError: errors.device, serverError: errors.server } };
}
