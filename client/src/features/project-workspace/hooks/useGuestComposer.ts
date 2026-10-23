import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreationDraftSchema, type CreationAction, type CreationDraft, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { ProjectIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { GuestDraftSchema, GuestDraftStore, type GuestDraft } from "@/repositories/workflow/GuestDraftStore";
import type { PromptComposerProps } from "../components/PromptComposer";
import type { CapabilityLookupStatus } from "../components/CapabilitySettings";
import { fetchPublicProfiles } from "../api/workflowApi";
import { editDraftBuffer, openDraftBuffer, redoDraftBuffer, undoDraftBuffer, type DraftBuffer } from "../state/draftBuffer";
import { autoSettings, settingsForOutput, settingsForProfile } from "../state/capabilitySettings";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { wordsDraftContent } from "../state/inputBinding";
import { placeActions } from "@shared/workflow/actionRegistry";

const GUEST_PROJECT = ProjectIdSchema.parse("project_guest");
const UNSELECTED = { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 } as const;

function freshGuestDraft(action: CreationAction): GuestDraft {
  return GuestDraftSchema.parse({ schemaVersion: "vidra-guest-draft/v1", id: `guest_${crypto.randomUUID()}`, conversationId: `conversation_${crypto.randomUUID()}`, draftId: `draft_${crypto.randomUUID()}`, action, instructions: "", settings: { ...UNSELECTED, parameters: {} }, updatedAt: new Date().toISOString() });
}

/** The composer reads a draft record; this one never leaves the browser. */
function localRecord(draft: GuestDraft): CreationDraft {
  return CreationDraftSchema.parse({
    schemaVersion: "vidra-workflow/v2", id: draft.draftId, ownerId: "guest", projectId: GUEST_PROJECT, conversationId: draft.conversationId, revision: 1, status: "open",
    ...wordsDraftContent(draft.action, draft.instructions, draft.settings, GUEST_PROJECT, draft.conversationId, 1),
    createdAt: draft.updatedAt, updatedAt: draft.updatedAt,
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
    const action: CreationAction = intent === "make-image" ? "make-image" : "make-video";
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
  // The model last used for each action, so switching outputs never drops back to "Choose model".
  const remembered = useRef<Partial<Record<CreationAction, DraftContent["settings"]>>>({});
  const changeAction = useCallback((action: CreationAction): void => update(current => {
    if (action === current.content.action) return current;
    if (current.content.settings.profileId !== "unselected") remembered.current[current.content.action] = current.content.settings;
    return editDraftBuffer(current, { ...current.content, action, settings: settingsForOutput(current.content, action, profiles, remembered.current[action]) });
  }), [profiles, update]);
  // Once models load, Auto takes its candidates' starting values instead of showing empty chips.
  useEffect(() => {
    if (!profiles.length) return;
    update(current => {
      if (current.content.settings.profileId !== "unselected" || Object.keys(current.content.settings.parameters).length) return current;
      const settings = settingsForOutput(current.content, current.content.action, profiles);
      return canonicalJson(settings) === canonicalJson(current.content.settings) ? current : editDraftBuffer(current, { ...current.content, settings });
    });
  }, [profiles, update]);
  const keep = useCallback((): string => { persist(bufferRef.current); return guest.id; }, [guest.id, persist]);

  const controller = useMemo((): PromptComposerProps["controller"] => ({
    active: buffer, loading: false, profiles, media: [], localErrors, saveErrors: {}, prepared: undefined, preparing: false,
    project: { status: "active" }, conversation: { status: "active" }, view: { requests: [] },
    edit,
    newDraft: async action => changeAction(action),
    chooseAuto: () => update(current => current.content.settings.profileId === "unselected" ? current : editDraftBuffer(current, { ...current.content, settings: autoSettings(current.content, current.content.action, profiles) })),
    chooseProfile: profile => update(current => !placeActions(current.content.action).includes(profile.action) ? current : editDraftBuffer(current, { ...current.content, action: profile.action, settings: settingsForProfile(profile, current.content) })),
    flush: async () => true,
    undo: () => update(undoDraftBuffer),
    redo: () => update(redoDraftBuffer),
    access: async () => { throw new Error("Sign in to use your media."); },
  }), [buffer, changeAction, edit, localErrors, profiles, update]);

  return { controller, lookupStatus, changeAction, keep };
}
