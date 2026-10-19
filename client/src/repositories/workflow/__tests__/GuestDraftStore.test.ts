import { beforeEach, expect, it } from "vitest";
import { GuestDraftStore, type GuestDraft } from "../GuestDraftStore";

const now = Date.parse("2026-10-19T12:00:00.000Z");
const draft = { schemaVersion: "vidra-guest-draft/v1", id: "guest_0f6c2a1e-2222", conversationId: "conversation_guest", draftId: "draft_guest", action: "make-image", instructions: "Neon rain on a quiet street", settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 }, updatedAt: "2026-10-19T11:00:00.000Z" } as GuestDraft;
beforeEach(() => { localStorage.clear(); });

it("keeps one signed-out draft across reloads", () => {
  expect(new GuestDraftStore(() => now).write(draft)).toBe(true);
  expect(new GuestDraftStore(() => now).read()).toEqual(draft);
});

it("drops a copy older than a day", () => {
  const store = new GuestDraftStore(() => now + 24 * 60 * 60 * 1000);
  store.write(draft);
  expect(store.read()).toBeUndefined();
  expect(localStorage.getItem("vidra-guest-draft/v1")).toBeNull();
});

it("drops unreadable or tampered copies instead of restoring them", () => {
  const store = new GuestDraftStore(() => now);
  localStorage.setItem("vidra-guest-draft/v1", "{not json");
  expect(store.read()).toBeUndefined();
  localStorage.setItem("vidra-guest-draft/v1", JSON.stringify({ ...draft, inputs: [{ state: "resolved", versionId: "version_other" }] }));
  expect(store.read()).toBeUndefined();
  expect(localStorage.getItem("vidra-guest-draft/v1")).toBeNull();
});
