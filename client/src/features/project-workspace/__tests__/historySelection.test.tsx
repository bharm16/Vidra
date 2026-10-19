import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AcceptedRequestSchema, RequestSlotSchema, type AcceptedRequest, type RequestSlot } from "@shared/schemas/workflow/request.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { ConversationHistory } from "../components/ConversationHistory";

const timestamp = "2026-10-17T06:00:00.000Z";
const image = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_stadium", ownerId: "owner", projectId: "project_current", kind: "image", label: "Stadium", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "stadium", storagePath: "uploads/owner/stadium" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
const other = MediaVersionSchema.parse({ ...image, id: "version_desk", label: "Desk" });
const access = vi.fn(async (id: string) => ({ url: `/media/${id}.png` }));

function slot(id: string, ordinal: number, patch: Partial<RequestSlot> = {}): RequestSlot {
  return RequestSlotSchema.parse({ id, ordinal, outcome: "completed", delivery: "ready", versionId: ordinal === 1 ? image.id : other.id, usage: { mode: "free", reserved: 0, settled: 0 }, ...patch });
}

function request(slots: RequestSlot[], action: AcceptedRequest["snapshot"]["action"] = "make-image"): AcceptedRequest {
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_current", ownerId: "owner", projectId: "project_current", conversationId: "conversation_current", submissionId: "submission_current", executionDraftId: "draft_current", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot: { action, instructions: "Explore evening light.", inputs: [], settings: { profileId: "qualified", profileRevision: "1", parameters: {}, outputCount: slots.length }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } }, materializedContext: { projectInstructions: "", entries: [] }, slots, acceptedAt: timestamp });
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each([1, 2])("keeps a viewed image in a completed %i-slot request unoutlined and keyboard-inspectable", async count => {
  const user = userEvent.setup();
  const current = request([slot("slot_stadium", 1), ...(count === 2 ? [slot("slot_desk", 2)] : [])]);
  const original = JSON.stringify(current);
  const onView = vi.fn();
  render(<ConversationHistory requests={[current]} media={[image, other]} selected={image.id} pending={[]} access={access} onView={onView} onRecover={vi.fn()} />);
  const viewed = screen.getByRole("button", { name: "View Stadium" });
  expect(viewed).toHaveAttribute("aria-pressed", "true");
  expect(viewed).not.toHaveAttribute("data-selected");
  expect(onView).not.toHaveBeenCalled();
  await user.tab();
  expect(viewed).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onView).toHaveBeenCalledExactlyOnceWith(image.id);
  expect(viewed).not.toHaveAttribute("data-selected");
  expect(JSON.stringify(current)).toBe(original);
  await waitFor(() => expect(access).toHaveBeenCalledWith(image.id));
});

it.each(["video", "export"])("marks the viewed playable %s and keeps view callbacks bound to its exact identity", async kind => {
  const user = userEvent.setup();
  const playable = MediaVersionSchema.parse({ ...image, kind });
  const current = request([slot("slot_stadium", 1)], "make-video");
  const onView = vi.fn();
  const props = { requests: [current], media: [playable], pending: [], access, onView, onRecover: vi.fn() };
  const { rerender } = render(<ConversationHistory {...props} selected={playable.id} />);
  const viewed = screen.getByRole("button", { name: "View Stadium" });
  expect(viewed).toHaveAttribute("data-selected", "true");
  expect(viewed).toHaveAttribute("aria-pressed", "true");
  expect(onView).not.toHaveBeenCalled();
  await user.click(viewed);
  expect(onView).toHaveBeenCalledExactlyOnceWith(playable.id);
  rerender(<ConversationHistory {...props} selected={undefined} />);
  expect(viewed).not.toHaveAttribute("data-selected");
  expect(viewed).toHaveAttribute("aria-pressed", "false");
  expect(onView).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(access).toHaveBeenCalledWith(playable.id));
});

const unfinished: { outcome: RequestSlot["outcome"]; delivery: RequestSlot["delivery"] }[] = [
  { outcome: "queued", delivery: "none" },
  { outcome: "running", delivery: "none" },
  { outcome: "unknown", delivery: "none" },
  { outcome: "completed", delivery: "storing" },
  { outcome: "completed", delivery: "stored" },
  { outcome: "completed", delivery: "attaching" },
];

it.each(unfinished)("marks a chosen image while batch work is $outcome/$delivery, then clears only its paint on completion", async work => {
  const first = slot("slot_stadium", 1);
  const current = request([first, slot("slot_desk", 2, { ...work, versionId: undefined })]);
  const accepted = JSON.stringify(current);
  const onView = vi.fn();
  const props = { selected: image.id, pending: [], access, onView, onRecover: vi.fn() };
  const { rerender } = render(<ConversationHistory {...props} requests={[current]} media={[image]} />);
  const viewed = screen.getByRole("button", { name: "View Stadium" });
  expect(viewed).toHaveAttribute("aria-pressed", "true");
  expect(viewed).toHaveAttribute("data-selected", "true");
  expect(onView).not.toHaveBeenCalled();
  const completed = request([first, slot("slot_desk", 2)]);
  rerender(<ConversationHistory {...props} requests={[completed]} media={[image, other]} newlyReadyVersionId={other.id} />);
  expect(viewed).toHaveAttribute("aria-pressed", "true");
  expect(viewed).not.toHaveAttribute("data-selected");
  expect(screen.getByRole("button", { name: "View Desk" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("New version ready")).toBeInTheDocument();
  expect([...document.querySelectorAll(".vf-result-slot")].map(node => node.getAttribute("data-slot-id"))).toEqual(["slot_stadium", "slot_desk"]);
  expect(onView).not.toHaveBeenCalled();
  expect(JSON.stringify(current)).toBe(accepted);
  await waitFor(() => expect(access).toHaveBeenCalledWith(other.id));
});
