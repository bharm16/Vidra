import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { ConversationHistory } from "../components/ConversationHistory";
import { RequestResults, RequestSlotStatus } from "../components/RequestResults";
import { PhraseReplacements, type PhraseReplacementsProps } from "../components/PhraseReplacements";
import { WordsTools } from "../components/WordsTools";

const timestamp = "2026-10-17T06:00:00.000Z";
const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_ready", ownerId: "owner", projectId: "project_current", kind: "image", label: "Floodlit track", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "ready", storagePath: "uploads/owner/ready" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
const access = vi.fn(async (id: string) => ({ url: `/media/${id}.png` }));
function request(): AcceptedRequest {
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "request_current", ownerId: "owner", projectId: "project_current", conversationId: "conversation_current", submissionId: "submission_current", executionDraftId: "draft_current", executionDraftRevision: 1, acceptanceSequence: 1, snapshotHash: "a".repeat(64), snapshot: { action: "make-image", instructions: "Give me four evening-light directions.", inputs: [], settings: { profileId: "qualified", profileRevision: "1", parameters: {}, outputCount: 4 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: "slot_ready", ordinal: 1, outcome: "completed", delivery: "ready", versionId: version.id, usage: { mode: "free", reserved: 0, settled: 0 } }, { id: "slot_failed", ordinal: 2, outcome: "failed", delivery: "none", error: { code: "PROVIDER_FAILED", message: "The provider failed." }, usage: { mode: "free", reserved: 0, settled: 0 } }, { id: "slot_queued", ordinal: 3, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }, { id: "slot_running", ordinal: 4, outcome: "running", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: timestamp });
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("opens the request menu without revising or reusing, then deliberately applies its exact request", async () => {
  const user = userEvent.setup(); const current = request();
  const onEditRequest = vi.fn(); const onReuseSetup = vi.fn(); const onNewVariation = vi.fn(); const onUseWords = vi.fn(); const onViewSources = vi.fn(); const onViewVersions = vi.fn(); const onHideFromMedia = vi.fn();
  render(<ConversationHistory requests={[current]} media={[version]} selected={version.id} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onEditRequest={onEditRequest} onReuseSetup={onReuseSetup} onNewVariation={onNewVariation} onUseWords={onUseWords} onViewSources={onViewSources} onViewVersions={onViewVersions} onHideFromMedia={onHideFromMedia} />);
  expect(screen.queryByRole("button", { name: "Reuse setup" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Request actions" }));
  expect(screen.getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Reuse setup", "Revise request", "New variation", "Use words", "View sources", "View versions", "Hide from media"]);
  expect(onEditRequest).not.toHaveBeenCalled(); expect(onReuseSetup).not.toHaveBeenCalled();
  await user.click(screen.getByRole("menuitem", { name: "Revise request" }));
  expect(onEditRequest).toHaveBeenCalledWith(current);
  expect(onReuseSetup).not.toHaveBeenCalled();
  await waitFor(() => expect(access).toHaveBeenCalledWith(version.id));
});

it("keeps partial-batch slot identities and ready result inspection separate from use and retry", async () => {
  const current = request(); const onView = vi.fn(); const onUseInput = vi.fn<(value: MediaVersion) => void>(); const onRetry = vi.fn();
  render(<RequestResults request={current} media={[version]} access={access} onView={onView} onUseInput={onUseInput} onRetry={onRetry} heading="Four evening-light directions" />);
  expect([...document.querySelectorAll(".vf-batch-slot")].map(slot => slot.getAttribute("data-slot-id"))).toEqual(["slot_ready", "slot_failed", "slot_queued", "slot_running"]);
  expect(screen.getByText("In the queue")).toBeInTheDocument(); expect(screen.getByText("Making your image")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View Floodlit track" }));
  expect(onView).toHaveBeenCalledWith(version.id); expect(onUseInput).not.toHaveBeenCalled(); expect(onRetry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use image 1" })); expect(onUseInput).toHaveBeenCalledWith(version);
  fireEvent.click(screen.getByRole("button", { name: "Try again result 2" })); expect(onRetry).toHaveBeenCalledWith(current, "slot_failed");
  await waitFor(() => expect(access).toHaveBeenCalledWith(version.id));
});

it("announces an observed completion without selecting it or relabelling historical media as new", async () => {
  const current = request(); const onView = vi.fn();
  const props = { requests: [current], media: [version], selected: undefined, pending: [], access, onView, onRecover: vi.fn() };
  const { rerender } = render(<ConversationHistory {...props} />);
  expect(screen.queryByText("New version ready")).not.toBeInTheDocument();
  rerender(<ConversationHistory {...props} newlyReadyVersionId={version.id} />);
  expect(screen.getByText("New version ready")).toBeInTheDocument(); expect(onView).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "View result" })); expect(onView).toHaveBeenCalledWith(version.id);
  rerender(<ConversationHistory {...props} selected={version.id} newlyReadyVersionId={version.id} />);
  expect(screen.getByText("Ready")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "View result" })).not.toBeInTheDocument();
  await waitFor(() => expect(access).toHaveBeenCalledWith(version.id));
});

it("allows deliberate batch inspection in read-only history while disabled mutation actions cannot fire", async () => {
  const user = userEvent.setup(); const current = request(); const onInspectRequest = vi.fn(); const onView = vi.fn(); const mutate = vi.fn();
  render(<ConversationHistory requests={[current]} media={[version]} selected={version.id} pending={[]} access={access} onView={onView} onRecover={vi.fn()} readOnly onInspectRequest={onInspectRequest} onReuseSetup={mutate} onEditRequest={mutate} onNewVariation={mutate} onUseWords={mutate} onHideFromMedia={mutate} onViewVersions={vi.fn()} onViewSources={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "View request results" })); expect(onInspectRequest).toHaveBeenCalledWith(current); expect(onView).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Request actions" }));
  for (const name of ["Reuse setup", "Revise request", "New variation", "Use words", "Hide from media", "View sources"]) expect(screen.getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("menuitem", { name: "Reuse setup" })); expect(mutate).not.toHaveBeenCalled();
  expect(screen.getByRole("menuitem", { name: "View versions" })).not.toHaveAttribute("aria-disabled");
  await waitFor(() => expect(access).toHaveBeenCalledWith(version.id));
});

it("does not offer unavailable result actions on a pending request", async () => {
  const user = userEvent.setup(); const full = request(); const current = { ...full, slots: full.slots.filter(slot => slot.id === "slot_queued") };
  render(<ConversationHistory requests={[current]} media={[]} selected={undefined} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onViewVersions={vi.fn()} onHideFromMedia={vi.fn()} onViewSources={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Request actions" }));
  for (const name of ["View versions", "Hide from media", "View sources"]) expect(screen.getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
});

it("keeps batch status tiles bound to their slots and permits read-only inspection without retrying", async () => {
  const base = request();
  const third = MediaVersionSchema.parse({ ...version, id: "version_third" });
  const current = AcceptedRequestSchema.parse({ ...base, slots: base.slots.map(slot => slot.ordinal === 3 ? { ...slot, outcome: "completed", delivery: "ready", versionId: third.id } : slot) });
  const onInspectRequest = vi.fn(); const onRetry = vi.fn(); const onView = vi.fn();
  render(<ConversationHistory requests={[current]} media={[version, third]} selected={version.id} pending={[]} access={access} onView={onView} onRecover={vi.fn()} readOnly onRetry={onRetry} onInspectRequest={onInspectRequest} describeRequest={() => "Model summary omitted for a batch"} />);
  expect([...document.querySelectorAll(".vf-result-slot")].map(node => node.getAttribute("data-slot-id"))).toEqual(["slot_ready", "slot_failed", "slot_queued", "slot_running"]);
  expect(document.querySelectorAll(".vf-result-card")).toHaveLength(2);
  expect(document.querySelectorAll(".vf-history-status-tile")).toHaveLength(2);
  expect(screen.queryByText("Model summary omitted for a batch")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry|try again/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Result 2: Could not make this image. View request results" }));
  expect(onInspectRequest).toHaveBeenCalledWith(current); expect(onRetry).not.toHaveBeenCalled(); expect(onView).not.toHaveBeenCalled();
  await waitFor(() => expect(access).toHaveBeenCalledWith(third.id));
});

it("describes image animation as video work in pending and failed statuses", () => {
  const base = request(); const current = AcceptedRequestSchema.parse({ ...base, snapshot: { ...base.snapshot, action: "animate-image" } });
  const running = current.slots.find(slot => slot.outcome === "running");
  const failed = current.slots.find(slot => slot.outcome === "failed");
  if (!running || !failed) throw new Error("Expected controlled pending and failed output slots");
  const { rerender } = render(<RequestSlotStatus request={current} slot={running} />);
  expect(screen.getByText("Making your video")).toBeInTheDocument();
  rerender(<RequestSlotStatus request={current} slot={failed} />);
  expect(screen.getByText("Could not make this video")).toBeInTheDocument();
  const onRetry = vi.fn();
  const unsaved = { ...failed, outcome: "completed" as const, delivery: "storage-failed" as const };
  rerender(<RequestSlotStatus request={current} slot={unsaved} onRetry={onRetry} />);
  expect(screen.getByText("Could not save this video")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: `Retry saving result ${unsaved.ordinal}` }));
  expect(onRetry).toHaveBeenCalledWith(current, unsaved.id);
});

it("keeps an unfinished two-slot animation request in the ordinary video status presentation", async () => {
  const base = request(); const running = base.slots.find(slot => slot.outcome === "running");
  if (!running || !base.slots[0]) throw new Error("Expected a ready result and a running slot");
  const current = AcceptedRequestSchema.parse({ ...base, snapshot: { ...base.snapshot, action: "animate-image", settings: { ...base.snapshot.settings, outputCount: 2 } }, slots: [base.slots[0], { ...running, ordinal: 2 }] });
  const video = MediaVersionSchema.parse({ ...version, kind: "video" });
  render(<ConversationHistory requests={[current]} media={[video]} selected={video.id} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onInspectRequest={vi.fn()} />);
  expect(screen.getByText("Making your video")).toBeInTheDocument();
  expect(document.querySelector(".vf-history-status-tile")).toBeNull();
  expect(document.querySelector(".vf-history-results")).not.toHaveAttribute("data-batch");
  expect(document.querySelector('.vf-result-slot[data-slot-id="slot_running"] .vf-output-status')).toHaveAttribute("data-presentation", "inline");
  await waitFor(() => expect(access).toHaveBeenCalledWith(video.id));
});

it("keeps quick wording choices separate from requesting more alternatives", () => {
  const onChoose = vi.fn(); const onSuggestAlternatives = vi.fn(); const onClose = vi.fn();
  render(<WordsTools phrase="warm evening light" choices={["Soft dusk light", "Golden hour", "Other result"]} onChoose={onChoose} onSuggestAlternatives={onSuggestAlternatives} onClose={onClose} />);
  expect(screen.getByText("“warm evening light”")).toBeInTheDocument(); expect(onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Suggest alternatives" })); expect(onSuggestAlternatives).toHaveBeenCalledTimes(1); expect(onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Golden hour" })); expect(onChoose).toHaveBeenCalledWith("Golden hour");
  fireEvent.keyDown(screen.getByRole("region", { name: "Words tools" }), { key: "Escape" }); expect(onClose).toHaveBeenCalledTimes(1);
});

it("offers a whole-request rewrite without phrase directions when nothing is selected", () => {
  const onChoose = vi.fn(); const props = { phrase: "a dog on a beach", whole: true, onChoose, onSuggestAlternatives: vi.fn(), onClose: vi.fn() };
  const { rerender } = render(<WordsTools {...props} choices={[]} busy />);
  expect(screen.getByRole("status")).toHaveTextContent("Improving your words…");
  expect(screen.queryByRole("button", { name: "Suggest alternatives" })).not.toBeInTheDocument();
  rerender(<WordsTools {...props} choices={["A golden retriever sprinting across wet sand at sunrise"]} />);
  fireEvent.click(screen.getByRole("button", { name: "A golden retriever sprinting across wet sand at sunrise" }));
  expect(onChoose).toHaveBeenCalledWith("A golden retriever sprinting across wet sand at sunrise");
});

function phraseProps(): PhraseReplacementsProps {
  return { suggestions: ["stadium lights soft and warm", "stadium lights bright and crisp", "stadium lights hazy and diffuse"], custom: "low golden sun", suggesting: false, onApply: vi.fn(), onCustomChange: vi.fn(), onSuggest: vi.fn(), onRetry: vi.fn(), onClose: vi.fn() };
}

it("retains usable existing replacements and custom words through custom-request loading and failure", () => {
  const props = phraseProps();
  const { rerender } = render(<PhraseReplacements {...props} suggesting />);
  expect(screen.getByRole("textbox", { name: "Describe another direction" })).toHaveValue("low golden sun");
  expect(screen.getByRole("button", { name: "Suggesting…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "stadium lights soft and warm" })); expect(props.onApply).toHaveBeenCalledWith("stadium lights soft and warm");
  rerender(<PhraseReplacements {...props} error="Network failed" errorMode="custom" />);
  expect(screen.getByText("Couldn’t load new options.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Describe another direction" })).toHaveValue("low golden sun");
  expect(within(screen.getByRole("region", { name: "Phrase replacements" })).queryByRole("heading")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(props.onRetry).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Describe another direction" }), { key: "Escape" }); expect(props.onClose).toHaveBeenCalledTimes(1);
});

it("offers no custom submit during initial loading and never applies an alternative implicitly", () => {
  const props = phraseProps();
  const { rerender } = render(<PhraseReplacements {...props} suggestions={[]} suggesting />);
  expect(screen.getByText("Finding alternatives…")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled();
  rerender(<PhraseReplacements {...props} suggestions={[]} />);
  expect(screen.getByText("No alternatives found.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Suggest" })); expect(props.onSuggest).toHaveBeenCalledTimes(1);
  expect(props.onApply).not.toHaveBeenCalled();
});

it("shows a later failed picture as a quiet error tile that retries its exact slot", async () => {
  const user = userEvent.setup(); const earlier = request(); const onRetry = vi.fn();
  const failed = AcceptedRequestSchema.parse({ ...earlier, id: "request_failed", acceptanceSequence: 2, snapshot: { ...earlier.snapshot, action: "make-image", instructions: "Warm up the desk scene.", settings: { ...earlier.snapshot.settings, outputCount: 1 } }, slots: [{ id: "slot_failed", ordinal: 1, outcome: "failed", delivery: "none", error: { code: "provider_failed", message: "The image could not be made." }, usage: { mode: "free", reserved: 0, settled: 0 } }] });
  render(<ConversationHistory requests={[earlier, failed]} media={[version]} selected={undefined} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onRetry={onRetry} />);
  expect(screen.queryByText("Could not make this image")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Could not make this image. Retry" }));
  expect(onRetry).toHaveBeenCalledExactlyOnceWith(failed, "slot_failed");
  await waitFor(() => expect(access).toHaveBeenCalledWith(version.id));
});

it("runs a later picture as a spinner tile and a later clip as status with its words instead of a message", async () => {
  const earlier = request();
  const later = (id: string, action: "make-image" | "make-video", instructions: string): AcceptedRequest => AcceptedRequestSchema.parse({ ...earlier, id, acceptanceSequence: 2, snapshot: { ...earlier.snapshot, action, instructions, settings: { ...earlier.snapshot.settings, outputCount: 1 } }, slots: [{ id: `slot_${id}`, ordinal: 1, outcome: "running", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }] });
  const picture = later("request_picture", "make-image", "Warm up the desk scene.");
  const { rerender } = render(<ConversationHistory requests={[earlier, picture]} media={[version]} selected={undefined} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onReuseSetup={vi.fn()} />);
  expect(screen.getByText("Warm up the desk scene.")).toHaveClass("vf-request-words");
  expect(screen.getByRole("status", { name: "Result 1: Making your image" })).toHaveClass("vf-history-status-tile");
  expect(screen.queryByText("Making your image")).not.toBeInTheDocument();
  const clip = later("request_clip", "make-video", "Make the stadium lights warmer.");
  rerender(<ConversationHistory requests={[earlier, clip]} media={[version]} selected={undefined} pending={[]} access={access} onView={vi.fn()} onRecover={vi.fn()} onReuseSetup={vi.fn()} />);
  const article = document.getElementById("vf-request-request_clip");
  if (!article) throw new Error("Expected the running clip request");
  expect(within(article).queryByRole("button", { name: "Request actions" })).not.toBeInTheDocument();
  expect(within(article).getByText("Making your video")).toBeInTheDocument();
  expect(within(article).getByText("Make the stadium lights warmer.")).toHaveClass("vf-output-caption");
  await waitFor(() => expect(access).toHaveBeenCalledWith(version.id));
});
