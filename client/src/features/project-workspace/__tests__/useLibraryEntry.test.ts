import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ConversationSchema,
  ProjectSchema,
} from "@shared/schemas/workflow/project.schemas";
import {
  CreationDraftSchema,
  type DraftContent,
} from "@shared/schemas/workflow/draft.schemas";
import {
  GuestDraftStore,
  type GuestDraft,
} from "@/repositories/workflow/GuestDraftStore";
import { useLibraryEntry } from "../hooks/useLibraryEntry";

vi.mock("../api/workflowApi", () => ({ WorkflowApi: class {} }));

const at = "2026-10-19T00:00:00.000Z";
const library = ProjectSchema.parse({
  schemaVersion: "vidra-workflow/v2",
  id: "project_library_abc",
  ownerId: "creator",
  revision: 1,
  name: "Library",
  status: "active",
  instructions: { revision: 1, text: "" },
  origin: { kind: "new" },
  role: "library",
  createdAt: at,
  updatedAt: at,
});
const kept: GuestDraft = {
  schemaVersion: "vidra-guest-draft/v1",
  id: "guest_0f6c2a1e-1111",
  conversationId: "conversation_kept" as GuestDraft["conversationId"],
  draftId: "draft_kept" as GuestDraft["draftId"],
  action: "make-video",
  instructions: "A lighthouse at dusk",
  settings: {
    profileId: "wan-t2v",
    profileRevision: "1",
    parameters: {},
    outputCount: 1,
  },
  updatedAt: new Date().toISOString(),
};

function ports() {
  return {
    ensureLibrary: vi.fn().mockResolvedValue(library),
    createConversation: vi.fn(
      async (projectId: string, id: string, name: string) =>
        ConversationSchema.parse({
          schemaVersion: "vidra-workflow/v2",
          id,
          projectId,
          ownerId: "creator",
          revision: 1,
          name,
          status: "active",
          acceptanceSequence: 0,
          initialContext: {
            origin: "empty",
            requestIds: [],
            projectInstructionsRevision: 1,
          },
          createdAt: at,
          updatedAt: at,
        }),
    ),
    createDraft: vi.fn(
      async (
        projectId: string,
        conversationId: string,
        id: string,
        content: DraftContent,
      ) =>
        CreationDraftSchema.parse({
          schemaVersion: "vidra-workflow/v2",
          id,
          ownerId: "creator",
          projectId,
          conversationId,
          revision: 1,
          status: "open",
          ...content,
          createdAt: at,
          updatedAt: at,
        }),
    ),
  };
}
beforeEach(() => {
  localStorage.clear();
});

it("opens the owner's library and retries after a failure", async () => {
  const api = ports();
  api.ensureLibrary.mockRejectedValueOnce(
    Object.assign(new Error("Your work could not open."), { status: 503 }),
  );
  const { result } = renderHook(() =>
    useLibraryEntry("creator", undefined, api),
  );
  await waitFor(() =>
    expect(result.current.error).toEqual({
      message: "Your work could not open.",
      status: 503,
    }),
  );
  expect(result.current.library).toBeUndefined();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.library).toEqual(library));
  expect(result.current.error).toBeUndefined();
  expect(result.current.claim).toBeUndefined();
});

it("never shows one account's library after switching to another", async () => {
  let resolveFirst: (value: typeof library) => void = () => undefined;
  const api = ports();
  api.ensureLibrary
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockImplementationOnce(() => new Promise(() => undefined));
  const { result, rerender } = renderHook(
    ({ owner }) => useLibraryEntry(owner, undefined, api),
    { initialProps: { owner: "creator" } },
  );
  rerender({ owner: "someone-else" });
  act(() => resolveFirst(library));
  await waitFor(() => expect(api.ensureLibrary).toHaveBeenCalledTimes(2));
  expect(result.current.library).toBeUndefined();
});

it("moves the matching signed-out draft into the library without submitting it", async () => {
  const store = new GuestDraftStore();
  store.write(kept);
  const api = ports();
  const { result } = renderHook(() =>
    useLibraryEntry("creator", kept.id, api, store),
  );
  await waitFor(() =>
    expect(result.current.claim).toEqual({
      state: "claimed",
      conversationId: "conversation_kept",
      draftId: "draft_kept",
    }),
  );
  expect(api.createConversation).toHaveBeenCalledWith(
    library.id,
    "conversation_kept",
    "New conversation",
  );
  expect(api.createDraft).toHaveBeenCalledWith(
    library.id,
    "conversation_kept",
    "draft_kept",
    {
      action: "make-video",
      instructions: "A lighthouse at dusk",
      inputs: [],
      settings: kept.settings,
      context: {
        origin: "empty",
        requestIds: [],
        projectInstructionsRevision: 1,
      },
      destination: {
        projectId: library.id,
        conversationId: "conversation_kept",
      },
    },
  );
  expect(store.read()).toBeUndefined();
});

it("imports nothing for a claim that does not match the kept draft", async () => {
  const store = new GuestDraftStore();
  store.write(kept);
  const api = ports();
  const { result } = renderHook(() =>
    useLibraryEntry("creator", "guest_someone-elses", api, store),
  );
  await waitFor(() =>
    expect(result.current.claim).toEqual({ state: "missing" }),
  );
  expect(api.createConversation).not.toHaveBeenCalled();
  expect(api.createDraft).not.toHaveBeenCalled();
  expect(store.read()).toEqual(kept);
});

it("keeps the signed-out draft when the claim fails, so retrying lands on the same records", async () => {
  const store = new GuestDraftStore();
  store.write(kept);
  const api = ports();
  api.createDraft.mockRejectedValueOnce(
    Object.assign(new Error("Not confirmed"), { status: 502 }),
  );
  const { result } = renderHook(() =>
    useLibraryEntry("creator", kept.id, api, store),
  );
  await waitFor(() =>
    expect(result.current.error?.message).toBe("Not confirmed"),
  );
  expect(store.read()).toEqual(kept);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.claim?.state).toBe("claimed"));
  expect(api.createConversation.mock.calls[0]).toEqual(
    api.createConversation.mock.calls[1],
  );
  expect(api.createDraft.mock.calls[0]?.slice(0, 3)).toEqual(
    api.createDraft.mock.calls[1]?.slice(0, 3),
  );
});
