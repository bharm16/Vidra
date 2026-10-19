import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreationDraftSchema, type CreationAction, type CreationDraft, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { GuestDraftSchema, GuestDraftStore, type GuestDraft } from "@/repositories/workflow/GuestDraftStore";
import type { PromptComposerProps } from "../components/PromptComposer";
import type { CapabilityLookupStatus } from "../components/ModelCreationArea";
import { fetchPublicProfiles } from "../api/workflowApi";
import { editDraftBuffer, openDraftBuffer, redoDraftBuffer, undoDraftBuffer, type DraftBuffer } from "../state/draftBuffer";
import { settingsForAction, settingsForProfile } from "../state/profileSettings";

const GUEST_PROJECT = "project_guest";
const UNSELECTED = { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 } as const;

function freshGuestDraft(action: CreationAction): GuestDraft {
  return GuestDraftSchema.parse({ schemaVersion: "vidra-guest-draft/v1", id: `guest_${crypto.randomUUID()}`, conversationId: `conversation_${crypto.randomUUID()}`, draftId: `draft_${crypto.randomUUID()}`, action, instructions: "", settings: { ...UNSELECTED, parameters: {} }, updatedAt: new Date().toISOString() });
}

/** The composer reads a draft record; this one never leaves the browser. */
function localRecord(draft: GuestDraft): CreationDraft {
  const destination = { projectId: GUEST_PROJECT, conversationId: draft.conversationId };
  return CreationDraftSchema.parse({
    schemaVersion: "vidra-workflow/v2", id: draft.draftId, ownerId: "guest", projectId: GUEST_PROJECT, conversationId: draft.conversationId, revision: 1, status: "open",
    action: draft.action, instructions: draft.instructions, inputs: [], settings: draft.settings,
    context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination, createdAt: draft.updatedAt, updatedAt: draft.updatedAt,
  });
}

export interface GuestComposer {
  controller: PromptComposerProps["controller"];
  lookupStatus: CapabilityLookupStatus;
  changeAction(action: CreationAction): void;
  /** Keeps the current words for after sign-in and returns the id that claims them. */
  keep(): string;
}

/** A signed-out composer: words and settings only, kept on this device until sign-in. */
export function useGuestComposer(intent: string | null, store: GuestDraftStore = new GuestDraftStore()): GuestComposer {
  const keeper = useRef(store);
  const [guest] = useState<GuestDraft>(() => {
    const kept = keeper.current.read();
    const action: CreationAction = intent === "make-video" ? "make-video" : "make-image";
    if (kept && (kept.instructions.trim() || !intent || kept.action === action)) return kept;
    return freshGuestDraft(action);
  });
  const [buffer, setBuffer] = useState<DraftBuffer>(() => openDraftBuffer(localRecord(guest)));
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const [profiles, setProfiles] = useState<CapabilityProfile[]>([]);
  const [lookupStatus, setLookupStatus] = useState<CapabilityLookupStatus>("loading");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const abort = new AbortController();
    fetchPublicProfiles(abort.signal)
      .then(rows => { if (!abort.signal.aborted) { setProfiles(rows); setLookupStatus("ready"); } })
      .catch(() => { if (!abort.signal.aborted) setLookupStatus("error"); });
    return () => abort.abort();
  }, []);

  const persist = useCallback((next: DraftBuffer): DraftBuffer => {
    const kept = keeper.current.write({ ...guest, action: next.content.action, instructions: next.content.instructions, settings: next.content.settings, updatedAt: new Date().toISOString() });
    setLocalErrors(kept ? {} : { [next.record.id]: "This browser can't keep your words. Sign in before leaving this page." });
    return kept ? { ...next, checkpointSequence: next.sequence } : next;
  }, [guest]);
  const update = useCallback((change: (current: DraftBuffer) => DraftBuffer): void => {
    const current = bufferRef.current;
    const next = change(current);
    if (next === current) return;
    const kept = persist(next);
    bufferRef.current = kept;
    setBuffer(kept);
  }, [persist]);

  const edit = useCallback((content: DraftContent, typingGroup?: string): void => update(current => editDraftBuffer(current, { ...content, inputs: [] }, typingGroup)), [update]);
  const changeAction = useCallback((action: CreationAction): void => update(current => action === current.content.action ? current : editDraftBuffer(current, { ...current.content, action, settings: settingsForAction(current.content) })), [update]);
  const keep = useCallback((): string => { persist(bufferRef.current); return guest.id; }, [guest.id, persist]);

  const controller = useMemo((): PromptComposerProps["controller"] => ({
    active: buffer, loading: false, profiles, media: [], localErrors, saveErrors: {}, prepared: undefined, preparing: false,
    project: { status: "active" }, conversation: { status: "active" }, view: { requests: [] },
    edit,
    newDraft: async action => changeAction(action),
    chooseProfile: profile => update(current => profile.action !== current.content.action ? current : editDraftBuffer(current, { ...current.content, settings: settingsForProfile(profile, current.content) })),
    flush: async () => true,
    undo: () => update(undoDraftBuffer),
    redo: () => update(redoDraftBuffer),
    access: async () => { throw new Error("Sign in to use your media."); },
  }), [buffer, changeAction, edit, localErrors, profiles, update]);

  return { controller, lookupStatus, changeAction, keep };
}
