import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreationDraftSchema, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { PromptComposer, type PromptComposerProps } from "../components/PromptComposer";
import { acknowledgeDraftBuffer, editDraftBuffer, openDraftBuffer, redoDraftBuffer, undoDraftBuffer } from "../state/draftBuffer";
import type { LabeledSpan } from "@/features/span-highlighting/hooks/useSpanLabeling";

const ports = vi.hoisted(() => {
  const spans: { current: LabeledSpan[] | undefined } = { current: undefined };
  return { suggestions: vi.fn(), spans, status: { current: "success" }, labelingEnabled: { current: undefined as boolean | undefined } };
});
vi.mock("@/features/span-highlighting/hooks/useSpanLabeling", async () => {
  const { useEffect, useRef } = await import("react");
  return { useSpanLabeling: ({ text, enabled, onResult }: { text: string; enabled: boolean; onResult(result: { text: string; spans: LabeledSpan[] }): void }) => {
    const callback = useRef(onResult); callback.current = onResult; ports.labelingEnabled.current = enabled;
    useEffect(() => { if (ports.spans.current) callback.current({ text, spans: ports.spans.current }); }, [text]);
    return { status: ports.status.current, refresh: vi.fn() };
  } };
});
vi.mock("@/api/enhancementSuggestionsApi", () => ({ requestEnhancementSuggestions: ports.suggestions }));
vi.mock("@/features/prompt-optimizer/api/customSuggestionsApi", () => ({ fetchCustomSuggestions: vi.fn() }));
const timestamp = "2026-10-17T06:00:00.000Z";
const profile = CapabilityProfileSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "controlled", revision: "1", label: "Available model", action: "make-image", provider: "controlled", endpoint: "controlled/picture", mode: "text-to-image", availability: "qualified", inputs: [], output: { kind: "image", maxCount: 1 }, maxContextCharacters: 32000, parameters: {}, recovery: { start: "supported", status: "supported", cancel: "supported", result: "supported", deadlineSeconds: 600 }, generatedAudio: "unsupported", pricing: { mode: "free", maximumCreditsPerSlot: 0 } });
const draft = CreationDraftSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "draft_current", ownerId: "creator", projectId: "project_current", conversationId: "conversation_current", revision: 1, status: "open", action: "make-image", instructions: "Cool lights. Keep the camera low.", inputs: [], settings: { profileId: "controlled", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" }, createdAt: timestamp, updatedAt: timestamp });
function controller(): PromptComposerProps["controller"] {
  return { active: openDraftBuffer(draft), loading: false, profiles: [profile], media: [], view: { requests: [] }, project: { status: "active" }, conversation: { status: "active" }, localErrors: {}, saveErrors: {}, prepared: undefined, preparing: false, newDraft: vi.fn(async () => undefined), edit: vi.fn(), flush: vi.fn(async () => true), chooseProfile: vi.fn(), undo: vi.fn(), redo: vi.fn(), access: vi.fn(async () => ({ url: "/picture.png" })) };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); ports.spans.current = undefined; ports.status.current = "success"; });

it("offers one direct action and automatic highlights without saved/review/undo chrome", async () => {
  const state = controller(); const onSubmit = vi.fn(async () => undefined);
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} onSubmit={onSubmit} onActionChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /highlights|review|generate|undo|redo/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/saved|saving/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Make image" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(state.edit).not.toHaveBeenCalled();
});

it("offers the input tiles some model for the output takes, even when the selected one does not", () => {
  render(<PromptComposer controller={controller()} onChooseInput={vi.fn()} onSketch={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Reference" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sketch" })).not.toBeInTheDocument();
  cleanup();
  const state = controller(); state.profiles = [profile, { ...profile, id: "controlled-references", label: "References model", inputs: [{ role: "reference", kinds: ["image"], minCount: 0, maxCount: 4 }] }];
  const onChooseInput = vi.fn();
  render(<PromptComposer controller={state} onChooseInput={onChooseInput} onSketch={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Reference" }));
  expect(onChooseInput).toHaveBeenCalledWith("reference");
  expect(screen.getByRole("button", { name: "Sketch" })).toBeInTheDocument();
});

it("an unqualified model cannot dispatch but preserves its current words", () => {
  const state = controller(); state.profiles = [{ ...profile, availability: "unqualified", unavailableReason: "This operation has not been qualified." }];
  const onSubmit = vi.fn(async () => undefined);
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} onSubmit={onSubmit} />);
  expect(screen.getByRole("button", { name: "Make image" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Current request words" })).toHaveValue(draft.instructions);
  expect(onSubmit).not.toHaveBeenCalled();
});

it("keeps unsupported area generation disabled even with words and an otherwise qualified model", () => {
  const state = controller();
  const onSubmit = vi.fn(async () => undefined);
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} onSubmit={onSubmit} submissionBlockedReason="Area edits are unavailable for the current models." />);
  expect(screen.getByRole("button", { name: "Make image" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Current request words" })).toHaveValue(draft.instructions);
  fireEvent.click(screen.getByRole("button", { name: "Make image" }));
  expect(onSubmit).not.toHaveBeenCalled();
});

it("enables a verified ready import while retaining its original receipt for server admission", async () => {
  const state = controller();
  const imported = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_ready", ownerId: "creator", projectId: "project_current", kind: "image", label: "Ready picture", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "verified", assetId: "ready", storagePath: "uploads/creator/ready", generation: "1", sha256: "a".repeat(64), bytes: 100 }, metadata: { state: "verified", width: 32, height: 32, durationSeconds: 0, audio: "absent", probeVersion: "controlled" }, association: "linked", createdAt: timestamp });
  state.active = openDraftBuffer(CreationDraftSchema.parse({ ...draft, action: "edit-image", inputs: [{ state: "importing", role: "primary", importId: "import_ready" }] }));
  state.media = [imported];
  state.profiles = [{ ...profile, action: "edit-image", inputs: [{ role: "primary", kinds: ["image"], minCount: 1, maxCount: 1 }] }];
  const onSubmit = vi.fn(async () => undefined);
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} onSubmit={onSubmit} />);
  expect(screen.getByRole("button", { name: "Edit image" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Edit image" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(state.active.content.inputs).toEqual([{ state: "importing", role: "primary", importId: "import_ready" }]);
  expect(state.edit).not.toHaveBeenCalled();
});

it("removing the edit source restores picture creation and keeps the unfinished words", async () => {
  const state = controller();
  const version = MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id: "version_base", ownerId: "creator", projectId: "project_current", kind: "image", label: "Desk", origin: { kind: "upload" }, sourceInputs: [], object: { identity: "unknown", assetId: "base", storagePath: "uploads/creator/base" }, metadata: { state: "pending" }, association: "linked", createdAt: timestamp });
  const editDraft = CreationDraftSchema.parse({ ...draft, action: "edit-image", inputs: [{ state: "resolved", role: "primary", versionId: version.id }] });
  state.active = openDraftBuffer(editDraft); state.media = [version]; state.profiles = [{ ...profile, action: "edit-image" }];
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} onSubmit={vi.fn(async () => undefined)} onSketch={vi.fn()} />);
  expect(screen.queryByText("Reference")).not.toBeInTheDocument();
  expect(screen.queryByText("Sketch")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove primary input" }));
  expect(state.edit).toHaveBeenCalledWith(expect.objectContaining({ action: "make-image", instructions: draft.instructions, inputs: [] }));
  await waitFor(() => expect(state.access).toHaveBeenCalledWith(version.id));
});

it("applies a selected replacement after revalidating unrelated concurrent edits without a review step", async () => {
  ports.suggestions.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { suggestions: ["Warm lamps"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const state = controller();
  const { rerender } = render(<PromptComposer controller={state} onChooseInput={vi.fn()} />);
  const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Current request words" });
  textarea.setSelectionRange(0, 11); fireEvent.mouseUp(textarea);
  await screen.findByRole("button", { name: "Warm lamps" });
  const active = state.active;
  if (!active) throw new Error("Expected an editable fixture draft");
  const next = { ...state, active: { ...active, sequence: active.sequence + 1, content: { ...active.content, instructions: "Cool lights. Keep the camera steady." } } };
  rerender(<PromptComposer controller={next} onChooseInput={vi.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Warm lamps" })); });
  expect(state.edit).toHaveBeenCalledWith(expect.objectContaining({ instructions: "Warm lamps. Keep the camera steady." }));
  expect(screen.queryByRole("button", { name: /review current phrase/i })).not.toBeInTheDocument();
});

it("lets keyboard users inspect a highlighted phrase without editing, then apply its exact target", async () => {
  ports.spans.current = [{ start: 0, end: 11, text: "Cool lights", category: "Lighting", confidence: 1 }];
  ports.suggestions.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { suggestions: ["Warm lamps"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const state = controller();
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} />);
  const phrase = await screen.findByRole("button", { name: "Cool lights: Lighting. Find alternatives" });
  act(() => { phrase.focus(); });
  expect(phrase).toHaveFocus(); expect(state.edit).not.toHaveBeenCalled(); expect(ports.suggestions).not.toHaveBeenCalled();
  fireEvent.keyDown(phrase, { key: "Enter" });
  const choice = await screen.findByRole("button", { name: "Warm lamps" });
  expect(ports.suggestions).toHaveBeenCalledWith(expect.objectContaining({ highlightedText: "Cool lights", fullPrompt: draft.instructions }));
  expect(state.edit).not.toHaveBeenCalled();
  fireEvent.click(choice);
  expect(state.edit).toHaveBeenCalledWith(expect.objectContaining({ instructions: "Warm lamps. Keep the camera low." }));
});

it("keeps highlighted phrases inert when the conversation is read only", async () => {
  ports.spans.current = [{ start: 0, end: 11, text: "Cool lights", category: "Lighting", confidence: 1 }];
  const state = controller(); state.conversation = { status: "archived" };
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} />);
  const group = await screen.findByRole("group", { name: "Suggested phrases" });
  expect(group.querySelector('[role="button"]')).toBeNull();
  const phrase = group.querySelector('[data-tone="lighting"]');
  if (!phrase) throw new Error("Expected the retained lighting category");
  fireEvent.keyDown(phrase, { key: "Enter" });
  expect(screen.getByRole("textbox", { name: "Current request words" })).toHaveAttribute("readonly");
  expect(ports.suggestions).not.toHaveBeenCalled(); expect(state.edit).not.toHaveBeenCalled();
});

it("shows the compact at-risk indicator only when both copies fail and retains the exact failure details", () => {
  const state = controller(); const active = state.active;
  if (!active) throw new Error("Expected the current draft");
  state.active = { ...active, sequence: 1 };
  state.localErrors = { [active.record.id]: "Device copy failed." };
  state.saveErrors = { [active.record.id]: "Server copy failed." };
  const { rerender } = render(<PromptComposer controller={state} onChooseInput={vi.fn()} />);
  const indicator = screen.getByRole("status");
  expect(indicator).toHaveTextContent("Not saved · Keep this tab open");
  expect(indicator).toHaveAttribute("title", "Device copy failed. Server copy failed.");
  expect(indicator.getAttribute("aria-describedby")).toBe(screen.getByText("Device copy failed. Server copy failed.").id);
  expect(screen.queryByRole("button", { name: "Retry saving" })).not.toBeInTheDocument();
  expect(state.edit).not.toHaveBeenCalled(); expect(state.flush).not.toHaveBeenCalled();
  rerender(<PromptComposer controller={{ ...state, localErrors: {}, active: { ...state.active, checkpointSequence: 1 } }} onChooseInput={vi.fn()} />);
  expect(screen.queryByText("Not saved · Keep this tab open")).not.toBeInTheDocument();
  expect(screen.getByText("Your latest words are kept on this device. Retry saving to reopen them elsewhere.")).toBeInTheDocument();
});

it("keeps generation unavailable while the latest words are saved neither on this device nor on the server", () => {
  const state = controller(); const active = state.active;
  if (!active) throw new Error("Expected the current draft");
  state.active = { ...active, sequence: 1 };
  state.localErrors = { [active.record.id]: "Device copy failed." };
  state.saveErrors = { [active.record.id]: "Server copy failed." };
  const { rerender } = render(<PromptComposer controller={state} onChooseInput={vi.fn()} onSubmit={vi.fn(async () => undefined)} />);
  expect(screen.getByRole("button", { name: "Make image" })).toBeDisabled();
  rerender(<PromptComposer controller={{ ...state, localErrors: {}, active: { ...state.active, checkpointSequence: 1 } }} onChooseInput={vi.fn()} onSubmit={vi.fn(async () => undefined)} />);
  expect(screen.getByRole("button", { name: "Make image" })).toBeEnabled();
});

it("dismisses alternatives with Escape while the native textarea still owns its selected range", async () => {
  ports.suggestions.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { suggestions: ["Warm lamps"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const state = controller();
  render(<PromptComposer controller={state} onChooseInput={vi.fn()} />);
  const field = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Current request words" });
  act(() => { field.focus(); field.setSelectionRange(0, 11); }); fireEvent.mouseUp(field);
  await screen.findByRole("button", { name: "Warm lamps" });
  expect(field).toHaveFocus();
  fireEvent.keyDown(field, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "Phrase replacements" })).not.toBeInTheDocument();
  expect(field).toHaveValue(draft.instructions); expect([field.selectionStart, field.selectionEnd]).toEqual([0, 11]);
  expect(state.edit).not.toHaveBeenCalled();
});

function compactComposer(instructions: string): { state: PromptComposerProps["controller"]; field: HTMLTextAreaElement; refresh(): void } {
  vi.spyOn(HTMLTextAreaElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 304, 78));
  vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLTextAreaElement): number { return this.value.split("\n").length * 26; });
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computedStyle(element, pseudo);
    if (element instanceof HTMLTextAreaElement) { style.font = "17px / 26px Figtree"; style.lineHeight = "26px"; }
    return style;
  });
  const state = controller(); state.active = openDraftBuffer(CreationDraftSchema.parse({ ...draft, instructions }));
  let refresh = (): void => undefined;
  const active = (): NonNullable<typeof state.active> => { if (!state.active) throw new Error("Expected the current draft"); return state.active; };
  state.edit = vi.fn((content: DraftContent, typingGroup?: string) => { state.active = editDraftBuffer(active(), content, typingGroup); refresh(); });
  state.undo = vi.fn(() => { state.active = undoDraftBuffer(active()); refresh(); });
  state.redo = vi.fn(() => { state.active = redoDraftBuffer(active()); refresh(); });
  const node = (): React.ReactElement => <div className="vf-conversation"><PromptComposer controller={state} onChooseInput={vi.fn()} /></div>;
  const view = render(node()); refresh = () => view.rerender(node());
  return { state, field: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Current request words" }), refresh };
}

async function applyWarmLamps(field: HTMLTextAreaElement): Promise<void> {
  ports.suggestions.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { suggestions: ["Warm lamps"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  act(() => { field.focus(); field.setSelectionRange(0, 11); }); fireEvent.mouseUp(field);
  fireEvent.click(await screen.findByRole("button", { name: "Warm lamps" }));
}

it.each([[2, "52px"], [3, "72px"], [4, "96px"]])("allocates the native scrolling Apply outcome for %i lines without another draft edit", async (lines, height) => {
  const words = ["Cool lights", ...Array.from({ length: Number(lines) - 1 }, () => "Keep this line.")].join("\n");
  const { state, field, refresh } = compactComposer(words);
  const before = structuredClone(state.active?.content);
  await applyWarmLamps(field);
  await waitFor(() => expect(field.closest(".vf-composer-region")).toHaveAttribute("data-phrase-applied", "true"));
  expect(field.closest<HTMLElement>(".vf-composer-region")?.style.getPropertyValue("--vf-words-height")).toBe(height);
  expect(field.style.overflowY).toBe("auto");
  expect(field.value).toBe(words.replace("Cool lights", "Warm lamps"));
  expect(state.edit).toHaveBeenCalledTimes(1); expect(state.active?.past).toHaveLength(1);
  expect(state.active?.content).toEqual({ ...before, instructions: field.value });
  const active = state.active; if (!active) throw new Error("Expected applied draft");
  state.active = acknowledgeDraftBuffer(active, { ...active.record, revision: 2 }, active.sequence); refresh();
  expect(field.closest(".vf-composer-region")).toHaveAttribute("data-phrase-applied", "true");
  expect(state.edit).toHaveBeenCalledTimes(1);
});

it.each(["manual", "context", "undo"] as const)("invalidates the Apply layout after a %s change without inferring it again from matching words", async change => {
  const words = "Cool lights\nKeep the camera low.\nRetain the scene.";
  const { state, field } = compactComposer(words);
  await applyWarmLamps(field);
  await waitFor(() => expect(field.closest(".vf-composer-region")).toHaveAttribute("data-phrase-applied", "true"));
  if (change === "manual") fireEvent.change(field, { target: { value: field.value.replace("scene", "setting") } });
  else if (change === "context") {
    const active = state.active; if (!active) throw new Error("Expected current draft");
    act(() => state.edit({ ...active.content, context: { ...active.content.context, projectInstructionsRevision: 2 } }));
  } else fireEvent.keyDown(field, { key: "z", metaKey: true });
  await waitFor(() => expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-applied"));
  expect(field.closest<HTMLElement>(".vf-composer-region")?.style.getPropertyValue("--vf-words-height")).toBe("77px");
  expect(field.style.overflowY).toBe("");
  if (change === "undo") {
    expect(field.value).toBe(words); fireEvent.keyDown(field, { key: "z", metaKey: true, shiftKey: true });
    expect(field.value).toBe(words.replace("Cool lights", "Warm lamps"));
    expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-applied");
    expect(state.edit).toHaveBeenCalledTimes(1);
  }
});

async function dismissPhrase(field: HTMLTextAreaElement, length = 11): Promise<void> {
  ports.suggestions.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { suggestions: ["Warm lamps"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  act(() => { field.focus(); field.setSelectionRange(0, length); }); fireEvent.mouseUp(field);
  await screen.findByRole("button", { name: "Warm lamps" });
  fireEvent.keyDown(field, { key: "Escape" });
}

it("records explicit dismissal only for the unchanged draft without Apply sizing or content writes", async () => {
  const words = "Cool lights\nKeep the camera low.\nRetain the scene.";
  const { state, field, refresh } = compactComposer(words);
  const before = structuredClone(state.active);
  await dismissPhrase(field);
  const region = field.closest<HTMLElement>(".vf-composer-region");
  expect(region).toHaveAttribute("data-phrase-outcome", "dismissed");
  expect(region).not.toHaveAttribute("data-phrase-applied");
  expect(region?.style.getPropertyValue("--vf-words-height")).toBe("77px");
  expect(field.style.overflowY).toBe("");
  expect(state.active).toEqual(before); expect(state.edit).not.toHaveBeenCalled();
  expect(field).toHaveFocus(); expect([field.selectionStart, field.selectionEnd]).toEqual([0, 11]);
  const active = state.active; if (!active) throw new Error("Expected dismissed draft");
  state.active = acknowledgeDraftBuffer(active, { ...active.record, revision: 2 }, active.sequence); refresh();
  expect(region).toHaveAttribute("data-phrase-outcome", "dismissed");
  expect(state.active.content).toEqual(before?.content); expect(state.edit).not.toHaveBeenCalled();
});

it.each(["manual", "context", "draft", "undo", "redo"] as const)("clears dismissal presentation after a %s change without deriving it from the words", async change => {
  const words = "Cool lights\nKeep the camera low.\nRetain the scene.";
  const { state, field, refresh } = compactComposer(words);
  await dismissPhrase(field);
  expect(field.closest(".vf-composer-region")).toHaveAttribute("data-phrase-outcome", "dismissed");
  if (change === "manual") fireEvent.change(field, { target: { value: words.replace("scene", "setting") } });
  else if (change === "context") {
    const active = state.active; if (!active) throw new Error("Expected current draft");
    act(() => state.edit({ ...active.content, context: { ...active.content.context, projectInstructionsRevision: 2 } }));
  } else if (change === "draft") {
    const active = state.active; if (!active) throw new Error("Expected current draft");
    state.active = openDraftBuffer(CreationDraftSchema.parse({ ...active.record, ...active.content, id: "draft_other" })); refresh();
  } else fireEvent.keyDown(field, { key: "z", metaKey: true, shiftKey: change === "redo" });
  await waitFor(() => expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-outcome"));
  expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-applied");
  if (change === "manual") {
    fireEvent.change(field, { target: { value: words } });
    expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-outcome");
  }
});

it("does not stamp a dismissed stale phrase onto a concurrently edited working copy", async () => {
  ports.suggestions.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { suggestions: ["Warm lamps"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
  const { state, field } = compactComposer("Cool lights\nKeep the camera low.\nRetain the scene.");
  act(() => { field.focus(); field.setSelectionRange(0, 11); }); fireEvent.mouseUp(field);
  await screen.findByRole("button", { name: "Warm lamps" });
  const active = state.active; if (!active) throw new Error("Expected current draft");
  act(() => state.edit({ ...active.content, instructions: active.content.instructions.replace("scene", "setting") }));
  fireEvent.keyDown(field, { key: "Escape" });
  expect(field).toHaveValue("Cool lights\nKeep the camera low.\nRetain the setting.");
  expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-outcome");
  expect(state.edit).toHaveBeenCalledTimes(1);
});

it("keeps the applied words while a later explicit dismissal returns only the presentation to neutral sizing", async () => {
  const { state, field } = compactComposer("Cool lights\nKeep the camera low.\nRetain the scene.");
  await applyWarmLamps(field);
  await waitFor(() => expect(field.closest(".vf-composer-region")).toHaveAttribute("data-phrase-outcome", "applied"));
  const applied = structuredClone(state.active);
  await dismissPhrase(field, 10);
  expect(field.closest(".vf-composer-region")).toHaveAttribute("data-phrase-outcome", "dismissed");
  expect(field.closest(".vf-composer-region")).not.toHaveAttribute("data-phrase-applied");
  expect(field.closest<HTMLElement>(".vf-composer-region")?.style.getPropertyValue("--vf-words-height")).toBe("77px");
  expect(state.active).toEqual(applied); expect(state.edit).toHaveBeenCalledTimes(1);
});

it("shows plain words under the highlighting notice when labeling fails", async () => {
  ports.spans.current = [{ start: 0, end: 11, text: "Cool lights", category: "Lighting", confidence: 1 }];
  const state = controller();
  const { rerender } = render(<PromptComposer controller={state} onChooseInput={vi.fn()} />);
  await screen.findByRole("group", { name: "Suggested phrases" });
  ports.status.current = "error";
  rerender(<PromptComposer controller={{ ...state }} onChooseInput={vi.fn()} />);
  expect(screen.getByText("Highlighting unavailable.")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Suggested phrases" })).not.toBeInTheDocument();
  expect(document.querySelector(".vf-word-highlights [data-tone]")).toBeNull();
  expect(screen.getByRole("textbox", { name: "Current request words" })).toHaveValue(draft.instructions);
});

it("states offline device retention only once the latest words are checkpointed, and keeps archived history explicit", () => {
  const state = controller(); const active = state.active;
  if (!active) throw new Error("Expected the current draft");
  state.active = { ...active, sequence: 2, checkpointSequence: 1 };
  const { rerender } = render(<PromptComposer controller={state} onChooseInput={vi.fn()} offline />);
  expect(screen.queryByText("Offline · saved on this device")).not.toBeInTheDocument();
  expect(screen.queryByText("Only on this device")).not.toBeInTheDocument();
  rerender(<PromptComposer controller={{ ...state, active: { ...state.active, checkpointSequence: 2 } }} onChooseInput={vi.fn()} offline />);
  expect(screen.getByText("Offline · saved on this device")).toBeInTheDocument();
  expect(screen.getByText("Only on this device")).toBeInTheDocument();
  rerender(<PromptComposer controller={{ ...state, conversation: { status: "archived" } }} onChooseInput={vi.fn()} />);
  expect(screen.getByText("Your work and history are kept")).toBeInTheDocument();
  expect(screen.queryByText("Only on this device")).not.toBeInTheDocument();
});

it("asks a signed-out writer to sign in for phrase help and never calls the suggestion services", async () => {
  const onAccountRequired = vi.fn();
  const unchosen = CreationDraftSchema.parse({ ...draft, settings: { ...draft.settings, profileId: "unselected", profileRevision: "unresolved" } });
  render(<PromptComposer controller={{ ...controller(), active: openDraftBuffer(unchosen) }} onChooseInput={vi.fn()} onActionChange={vi.fn()} assistance="account-required" onAccountRequired={onAccountRequired} />);
  expect(ports.labelingEnabled.current).toBe(false);
  const field = screen.getByLabelText("Current request words") as HTMLTextAreaElement;
  act(() => { field.focus(); field.setSelectionRange(0, 11); }); fireEvent.mouseUp(field);
  expect(ports.suggestions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Improve wording" }));
  expect(onAccountRequired).toHaveBeenCalledTimes(1);
  expect(ports.suggestions).not.toHaveBeenCalled();
});

it("keeps Improve wording and Ask a question on the words row, inert while the words are empty", () => {
  const empty = CreationDraftSchema.parse({ ...draft, instructions: "" });
  const onActionChange = vi.fn();
  const { rerender } = render(<PromptComposer controller={{ ...controller(), active: openDraftBuffer(empty) }} onChooseInput={vi.fn()} onActionChange={onActionChange} />);
  expect(screen.getByRole("button", { name: "Improve wording" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Ask a question" })).toBeDisabled();
  rerender(<PromptComposer controller={controller()} onChooseInput={vi.fn()} onActionChange={onActionChange} />);
  expect(screen.getByRole("button", { name: "Improve wording" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Ask a question" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Choose action" })).not.toBeInTheDocument();
  expect(onActionChange).not.toHaveBeenCalled();
});

it("asks a question about the words and returns to the output it left", () => {
  const onActionChange = vi.fn();
  const animation = CreationDraftSchema.parse({ ...draft, action: "animate-image" });
  const { rerender } = render(<PromptComposer controller={{ ...controller(), active: openDraftBuffer(animation) }} onChooseInput={vi.fn()} onActionChange={onActionChange} />);
  expect(screen.getByRole("radio", { name: "Video" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
  expect(onActionChange).toHaveBeenLastCalledWith("ask");
  const asking = CreationDraftSchema.parse({ ...draft, action: "ask" });
  rerender(<PromptComposer controller={{ ...controller(), active: openDraftBuffer(asking) }} onChooseInput={vi.fn()} onActionChange={onActionChange} />);
  expect(screen.getByRole("button", { name: "Ask a question" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
  expect(screen.getAllByRole("radio").every(radio => radio.getAttribute("aria-checked") === "false")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
  expect(onActionChange).toHaveBeenLastCalledWith("animate-image");
});
