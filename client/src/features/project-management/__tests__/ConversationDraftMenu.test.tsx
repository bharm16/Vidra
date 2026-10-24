import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConversationSchema } from "@shared/schemas/workflow/project.schemas";
import { CreationDraftSchema } from "@shared/schemas/workflow/draft.schemas";
import { ConversationDraftMenu } from "../components/ConversationDraftMenu";
import { ProjectManagementPanel } from "../ProjectManagementPanel";
import { conversation, project } from "./fixtures";

const ports = vi.hoisted(() => ({ listDrafts: vi.fn(), ownerId: "creator" }));
vi.mock("@/features/project-workspace/api", () => ({ WorkflowApi: class { listDrafts = ports.listDrafts; } }));
vi.mock("../api/projectManagementApi", () => ({ ProjectManagementApi: class {} }));
vi.mock("@/repositories/index", () => ({ getAuthRepository: () => ({ getCurrentUser: () => ({ uid: ports.ownerId }) }) }));
const draft = CreationDraftSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "draft_one", ownerId: "creator", projectId: project.id, conversationId: conversation.id, revision: 1, status: "parked", action: "make-image", instructions: "Keep these exact unfinished words", inputs: [], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: project.id, conversationId: conversation.id }, createdAt: project.createdAt, updatedAt: project.updatedAt });
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } { let resolve = (_value: T): void => { throw new Error("Deferred result not initialized"); }; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); ports.ownerId = "creator"; ports.listDrafts.mockResolvedValue([draft]); });
afterEach(cleanup);

it("opens the exact unfinished draft from its conversation context and filters submitted records", async () => {
  ports.listDrafts.mockResolvedValue([draft, { ...draft, id: "draft_submitted", status: "submitted", instructions: "Accepted history" }]);
  const onOpenDraft = vi.fn();
  render(<ConversationDraftMenu ownerId="creator" projectId={project.id} conversation={conversation} onOpenDraft={onOpenDraft} />);
  expect(ports.listDrafts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: `Unfinished requests in ${conversation.name}` }));
  fireEvent.click(await screen.findByRole("button", { name: /Keep these exact unfinished words/ }));
  await waitFor(() => expect(onOpenDraft).toHaveBeenCalledWith(draft));
  expect(screen.queryByText("Accepted history")).not.toBeInTheDocument();
  expect(ports.listDrafts).toHaveBeenCalledWith(project.id, conversation.id, expect.any(AbortSignal));
});

it("provides draft access only inside the past conversation list", async () => {
  render(<ProjectManagementPanel ownerId="creator" project={project} conversations={[conversation]} onProjectChange={vi.fn()} onConversationChange={vi.fn()} onOpenConversation={vi.fn()} onOpenDraft={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /unfinished requests/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Conversations$/ }));
  expect(screen.getByRole("button", { name: `Unfinished requests in ${conversation.name}` })).toBeInTheDocument();
});

it("rejects a foreign creator's draft without showing private words", async () => {
  ports.listDrafts.mockResolvedValue([{ ...draft, ownerId: "foreign", instructions: "Foreign secret words" }]);
  const onOpenDraft = vi.fn();
  render(<ConversationDraftMenu ownerId="creator" projectId={project.id} conversation={conversation} onOpenDraft={onOpenDraft} />);
  fireEvent.click(screen.getByRole("button", { name: /Unfinished requests in/ }));
  await screen.findByRole("button", { name: "Try again" });
  expect(screen.queryByText("Foreign secret words")).not.toBeInTheDocument();
  expect(onOpenDraft).not.toHaveBeenCalled();
});

it("ignores a late list from another conversation even if its transport ignores abort", async () => {
  const first = deferred<unknown[]>(); ports.listDrafts.mockReturnValueOnce(first.promise);
  const nextConversation = ConversationSchema.parse({ ...conversation, id: "conversation_two", name: "Second ideas" });
  const nextDraft = CreationDraftSchema.parse({ ...draft, id: "draft_two", conversationId: nextConversation.id, destination: { ...draft.destination, conversationId: nextConversation.id }, instructions: "Second conversation words" });
  const props = { ownerId: "creator", projectId: project.id, onOpenDraft: vi.fn() };
  const { rerender } = render(<ConversationDraftMenu {...props} conversation={conversation} />);
  fireEvent.click(screen.getByRole("button", { name: /Unfinished requests in/ }));
  await waitFor(() => expect(ports.listDrafts).toHaveBeenCalledTimes(1));
  const abort = ports.listDrafts.mock.calls[0]?.[2];
  ports.listDrafts.mockResolvedValue([nextDraft]);
  rerender(<ConversationDraftMenu {...props} conversation={nextConversation} />);
  expect(abort?.aborted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Unfinished requests in Second ideas" }));
  await screen.findByRole("button", { name: /Second conversation words/ });
  await act(async () => { first.resolve([draft]); });
  expect(screen.queryByText("Keep these exact unfinished words")).not.toBeInTheDocument();
});

it("does not select cached work after the signed-in account changes", async () => {
  const onOpenDraft = vi.fn();
  render(<ConversationDraftMenu ownerId="creator" projectId={project.id} conversation={conversation} onOpenDraft={onOpenDraft} />);
  fireEvent.click(screen.getByRole("button", { name: /Unfinished requests in/ }));
  const row = await screen.findByRole("button", { name: /Keep these exact unfinished words/ });
  ports.ownerId = "another";
  fireEvent.click(row);
  expect(onOpenDraft).not.toHaveBeenCalled();
});

it("lists only requests a person wrote: no empty scratch drafts, and one row for the same setup saved twice", async () => {
  const { writtenDrafts } = await import("../hooks/useConversationDrafts");
  const empty = CreationDraftSchema.parse({ ...draft, id: "draft_empty", instructions: "  " });
  const older = CreationDraftSchema.parse({ ...draft, id: "draft_older", updatedAt: "2026-01-01T00:00:00.000Z" });
  expect(writtenDrafts([empty, older, draft]).map(record => record.id)).toEqual([draft.id]);
});
