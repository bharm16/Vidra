import { Button } from "@promptstudio/system/components/ui/button";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { FreshButton, FreshIcon, FreshIconButton } from "@/components/fresh/FreshButton";
import { MAX_DRAFT_WORDS, type CreationAction, type DraftInput } from "@shared/schemas/workflow/draft.schemas";
import type { DraftBuffer } from "../state/draftBuffer";
import type { ProjectWorkspaceController } from "../hooks/useProjectWorkspace";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { applyPhraseChange, bindPhrase, reviewPhraseChange, type PhraseBinding } from "../state/phraseChange";
import { requestEnhancementSuggestions } from "@/api/enhancementSuggestionsApi";
import { requestImprovedWords } from "@/api/promptOptimizationApi";
import { ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";
import { z } from "zod";
import { fetchCustomSuggestions } from "@/features/prompt-optimizer/api/customSuggestionsApi";
import { useSpanLabeling, type LabeledSpan } from "@/features/span-highlighting/hooks/useSpanLabeling";
import { CapabilitySettings } from "./CapabilitySettings";
import { CompactInputPreview } from "./CompactInputPreview";
import { createPortal } from "react-dom";
import { ComposerSubmit } from "./ComposerSubmit";
import { WordsTools } from "./WordsTools";
import { SemanticTooltip } from "./SemanticTooltip";
import { HighlightingUnavailable } from "./HighlightingUnavailable";
import { PhraseReplacements } from "./PhraseReplacements";
import { capabilityProblems, resolveAuto } from "../state/capabilitySettings";
import { phraseMenuPosition } from "../state/phraseMenuPosition";
import type { CapabilityLookupStatus } from "./CapabilitySettings";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { importedVersionId } from "@shared/schemas/workflow/import.schemas";
import { observedDraftInputs, offeredInputRoles, roleKinds, withoutDraftInput, type OfferedInputRole } from "../state/inputBinding";
import { actionEntry, composerOutput, composerTool, placeActions, wordsPolicy } from "@shared/workflow/actionRegistry";
import { FlipScope } from "@/components/motion/FlipScope";
import { useOutputReshape } from "../hooks/useOutputReshape";
import { measurePromptSelection, type PromptSelectionPaint } from "../state/promptSelectionPaint";
import "./composer-fidelity.css";

const NO_LABELS: { text: string; spans: LabeledSpan[] } = { text: "", spans: [] };
const INPUT_TILE_LABELS: Record<Exclude<OfferedInputRole, "primary">, string> = { "start-frame": "Start frame", "end-frame": "End frame", reference: "Reference", clip: "Clip", audio: "Audio" };
/** An add-cell names its role; a subject cell names the kinds its models take. */
function inputTileLabel(role: OfferedInputRole, kinds: ReadonlyArray<"image" | "video" | "audio">): string {
  if (role !== "primary") return INPUT_TILE_LABELS[role];
  return kinds.includes("image") ? "Picture" : kinds.includes("audio") ? "Clip or audio" : "Clip";
}
const SuggestionResponseSchema = z.object({ suggestions: z.array(z.union([z.string(), z.object({ text: z.string() }), z.object({ suggestion: z.string() })])), isPlaceholder: z.boolean().optional() });
function contextKey(buffer: DraftBuffer): string { return canonicalJson({ action: buffer.content.action, inputs: buffer.content.inputs, settings: buffer.content.settings, context: buffer.content.context }); }

interface HighlightInteraction {
  writable: boolean;
  binding: PhraseBinding | undefined;
  keyboardFocus: boolean;
  onActivate(span: LabeledSpan): void;
}

interface PhraseOutcomePresentation {
  kind: "applied" | "dismissed";
  draftId: string;
  sequence: number;
  contextKey: string;
}

function highlightedWords(text: string, spans: LabeledSpan[], interaction: HighlightInteraction): ReactNode[] {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < cursor || span.end > text.length || span.end <= span.start || (span.quote ?? span.text) !== text.slice(span.start, span.end)) continue;
    pieces.push(<span aria-hidden="true" key={`plain:${cursor}`}>{text.slice(cursor, span.start)}</span>);
    const category = span.category.toLowerCase();
    const tone = category.includes("light") ? "lighting" : category.includes("motion") || category.includes("camera") ? "motion" : category.includes("environment") || category.includes("location") ? "environment" : "subject";
    const bound = interaction.binding?.start === span.start && interaction.binding.end === span.end;
    pieces.push(<span data-tone={tone} data-phrase-bound={bound || undefined} data-phrase-keyboard-focus={bound && interaction.keyboardFocus || undefined} title={span.category} key={`${span.start}:${span.end}`} role={interaction.writable ? "button" : undefined} tabIndex={interaction.writable ? 0 : undefined} aria-label={interaction.writable ? `${text.slice(span.start, span.end)}: ${span.category}. Find alternatives` : undefined} onKeyDown={event => {
      if (interaction.writable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); interaction.onActivate(span); }
    }}>{text.slice(span.start, span.end)}</span>);
    cursor = span.end;
  }
  pieces.push(<span aria-hidden="true" key={`plain:${cursor}`}>{text.slice(cursor)}</span>);
  return pieces;
}

export interface PromptComposerProps {
  controller: Pick<ProjectWorkspaceController, "active" | "loading" | "profiles" | "media" | "localErrors" | "saveErrors" | "prepared" | "preparing" | "newDraft" | "edit" | "flush" | "chooseProfile" | "undo" | "redo" | "access"> & Partial<Pick<ProjectWorkspaceController, "chooseAuto" | "parkedInputs" | "discardParkedInput">> & {
    project: Pick<NonNullable<ProjectWorkspaceController["project"]>, "status"> | undefined;
    conversation: Pick<NonNullable<ProjectWorkspaceController["conversation"]>, "status"> | undefined;
    view: Pick<ProjectWorkspaceController["view"], "requests">;
    serviceUnavailable?: boolean;
  };
  onChooseInput(role?: DraftInput["role"]): void;
  /** The picker for one offered input tile, named by its label. */
  inputControl?(role: OfferedInputRole, label: string): ReactNode;
  mediaActions?: ReactNode;
  capabilityLookupStatus?: CapabilityLookupStatus;
  primaryLabel?: string;
  inputLabel?(input: DraftInput, version: MediaVersion | undefined): string;
  renderInputPicker?(input: DraftInput, preview: ReactNode): ReactNode;
  inputStatus?(input: DraftInput): "uploading" | "pending" | "unavailable" | undefined;
  onSubmit?(): Promise<void>;
  onActionChange?(action: CreationAction): void;
  onSketch?(): void;
  submissionBlockedReason?: string;
  offline?: boolean;
  /** Signed-out visitors write and choose settings; phrase help needs an account. */
  assistance?: "available" | "account-required";
  onAccountRequired?(): void;
}

export function PromptComposer({ controller, onChooseInput, inputControl, mediaActions, capabilityLookupStatus = "ready", primaryLabel, inputLabel, renderInputPicker, inputStatus, onSubmit, onActionChange, onSketch, submissionBlockedReason, offline = false, assistance = "available", onAccountRequired }: PromptComposerProps): ReactElement {
  const buffer = controller.active;
  const highlightDescription = useId();
  const retentionDescription = useId();
  const [replacementPresentation, setReplacementPresentation] = useState<"alternatives" | "words">("alternatives");
  // Improve wording with nothing selected rewrites the whole request instead of swapping one phrase.
  const [wholeWords, setWholeWords] = useState(false);
  const [phrasePosition, setPhrasePosition] = useState({ left: 12, top: 12 });
  const [hoveredPhrase, setHoveredPhrase] = useState<{ category: string; left: number; top: number }>();
  const [keyboardPhraseFocus, setKeyboardPhraseFocus] = useState(false);
  const [compactTextHeight, setCompactTextHeight] = useState<number>();
  const [phraseOutcomePresentation, setPhraseOutcomePresentation] = useState<PhraseOutcomePresentation>();
  const [naturalTextHeight, setNaturalTextHeight] = useState(26);
  const [selectionPaint, setSelectionPaint] = useState<PromptSelectionPaint>();
  const [making, setMaking] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [binding, setBinding] = useState<PhraseBinding>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string>();
  const fetchEpoch = useRef(0);
  const customByTarget = useRef(new Map<string, string>());
  const textarea = useRef<HTMLTextAreaElement>(null);
  const painted = useRef<HTMLDivElement>(null);
  const typingGroup = useRef(crypto.randomUUID());
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  // Ask is a question about the words, not an output; leaving it returns to the last output.
  const lastOutput = useRef<CreationAction>("make-video");
  if (buffer && composerOutput(buffer.content.action)) lastOutput.current = buffer.content.action;
  const mediaRow = useRef<HTMLDivElement>(null);
  const reshape = useOutputReshape(buffer ? composerOutput(buffer.content.action) ?? composerTool(buffer.content.action) : undefined);
  const activeProfile = buffer ? controller.profiles.find(candidate => candidate.id === buffer.content.settings.profileId) ?? controller.profiles.find(candidate => placeActions(buffer.content.action).includes(candidate.action)) : undefined;
  const words = buffer ? wordsPolicy(buffer.content.action, activeProfile) : "required";
  const selectedKey = binding ? canonicalJson(binding) : undefined;
  const writable = buffer !== undefined && (buffer.record.status === "open" || buffer.record.status === "parked") && controller.project?.status === "active" && controller.conversation?.status === "active";
  const [labelResult, setLabels] = useState<{ text: string; spans: LabeledSpan[] }>(NO_LABELS);
  const assisted = assistance === "available";
  const labeling = useSpanLabeling({ text: buffer?.content.instructions ?? "", enabled: writable && assisted && (words === "required" || words === "optional"), cacheKey: buffer ? `${buffer.record.ownerId}:${buffer.record.id}` : null, onResult: result => { if (bufferRef.current?.content.instructions === result.text) setLabels({ text: result.text, spans: result.spans }); } });
  // S26: failed highlighting leaves plain words; earlier spans are not repainted under the notice.
  const labels = labeling.status === "error" ? NO_LABELS : labelResult;
  const scopeKey = buffer ? `${buffer.record.id}:${contextKey(buffer)}` : "";
  const phraseOutcome = buffer !== undefined && phraseOutcomePresentation?.draftId === buffer.record.id && phraseOutcomePresentation.sequence === buffer.sequence && phraseOutcomePresentation.contextKey === contextKey(buffer) ? phraseOutcomePresentation.kind : undefined;
  const appliedPresentation = phraseOutcome === "applied";
  useEffect(() => {
    if (phraseOutcomePresentation && !phraseOutcome) setPhraseOutcomePresentation(undefined);
  }, [phraseOutcome, phraseOutcomePresentation]);
  useLayoutEffect(() => {
    const field = textarea.current;
    if (!field) return;
    let current = true;
    const measure = (): void => {
      if (!current) return;
      const conversation = field.closest(".vf-conversation");
      const compact = Boolean(conversation) && field.getBoundingClientRect().width <= 400 && !field.closest("[data-empty]");
      if (!compact) { setCompactTextHeight(undefined); return; }
      const style = getComputedStyle(field);
      const mirror = document.createElement("textarea");
      Object.assign(mirror.style, { position: "fixed", visibility: "hidden", pointerEvents: "none", width: `${field.getBoundingClientRect().width}px`, height: "0px", minHeight: "0px", maxHeight: "none", padding: "0px", border: "0px", boxSizing: "border-box", font: style.font, letterSpacing: style.letterSpacing, whiteSpace: "pre-wrap", overflowWrap: style.overflowWrap, overflow: "hidden" });
      mirror.value = field.value;
      mirror.setAttribute("aria-hidden", "true"); mirror.tabIndex = -1;
      document.body.append(mirror);
      const naturalHeight = Math.max(26, Math.min(198, mirror.scrollHeight));
      const lineHeight = Number.parseFloat(style.lineHeight);
      const lines = Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(mirror.scrollHeight / lineHeight) : 0;
      // The live Apply outcomes allocate 72/96px for three/four 26px lines,
      // with native scrolling. Neutral editing keeps its 77/101px slots.
      const trailingLeading = lines >= 4 ? 3 : 1;
      const height = Math.max(52, Math.min(198, appliedPresentation ? lines * 24 : mirror.scrollHeight - trailingLeading));
      mirror.remove();
      setNaturalTextHeight(current => current === naturalHeight ? current : naturalHeight);
      setCompactTextHeight(current => current === height ? current : height);
    };
    measure();
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener("loadingdone", measure);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    const conversation = field.closest(".vf-conversation");
    if (conversation) observer?.observe(conversation);
    window.addEventListener("resize", measure);
    return () => { current = false; observer?.disconnect(); window.removeEventListener("resize", measure); document.fonts?.removeEventListener("loadingdone", measure); };
  }, [buffer?.record.id, buffer?.content.instructions, scopeKey, appliedPresentation]);
  useEffect(() => {
    if (binding && (!bufferRef.current || binding.draftId !== bufferRef.current.record.id || binding.contextKey !== contextKey(bufferRef.current))) { fetchEpoch.current += 1; setBinding(undefined); setSuggesting(false); }
  }, [binding, scopeKey]);

  useLayoutEffect(() => {
    const field = textarea.current;
    const editor = field?.closest<HTMLElement>(".vf-prompt-editor");
    if (!field || !editor) return;
    let live = true;
    let delayed: ReturnType<typeof setTimeout> | undefined;
    const update = (): void => {
      if (!live) return;
      const active = document.activeElement;
      const editingRange = active === field || active instanceof Element && Boolean(active.closest(".vf-phrase-replacements, .vf-words-tools"));
      const current = bufferRef.current;
      // Native input arrives before React's delegated onChange handler. Do not
      // repaint a controlled field until its corresponding content is committed.
      if (current?.content.instructions !== field.value) return;
      const next = editingRange ? measurePromptSelection(field, editor, labels.text === field.value ? labels.spans : []) : undefined;
      setSelectionPaint(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const afterFocus = (): void => { if (delayed) clearTimeout(delayed); delayed = setTimeout(update, 0); };
    for (const event of ["select", "keyup", "mouseup", "scroll", "focus"]) field.addEventListener(event, afterFocus);
    field.addEventListener("blur", afterFocus);
    document.addEventListener("selectionchange", afterFocus);
    document.addEventListener("focusin", afterFocus);
    window.addEventListener("resize", update);
    document.fonts?.addEventListener("loadingdone", update);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(field);
    update();
    return () => {
      live = false; if (delayed) clearTimeout(delayed); observer?.disconnect();
      for (const event of ["select", "keyup", "mouseup", "scroll", "focus"]) field.removeEventListener(event, afterFocus);
      field.removeEventListener("blur", afterFocus);
      document.removeEventListener("selectionchange", afterFocus); document.removeEventListener("focusin", afterFocus);
      window.removeEventListener("resize", update); document.fonts?.removeEventListener("loadingdone", update);
    };
  }, [buffer?.record.id, buffer?.content.instructions, labels, compactTextHeight]);

  useLayoutEffect(() => {
    if (!binding || !textarea.current) return;
    const panel = document.querySelector<HTMLElement>(replacementPresentation === "words" ? ".vf-words-tools" : ".vf-phrase-replacements");
    const position = (): void => {
      const field = textarea.current;
      const current = bufferRef.current;
      if (!field || !current || !panel) return;
      const rect = panel.getBoundingClientRect();
      const height = rect.height;
      const width = rect.width;
      const reviewed = reviewPhraseChange({ id: current.record.id, sequence: current.sequence, contextKey: contextKey(current), instructions: current.content.instructions, writable }, binding);
      const target = reviewed.state === "reviewable" ? reviewed.binding : binding;
      let next = phraseMenuPosition(field, target.start, target.end, height, width);
      const composer = field.closest(".vf-composer")?.getBoundingClientRect();
      if (replacementPresentation === "words" && window.innerWidth >= 768 && composer && composer.width <= 400) next = { left: Math.max(12, Math.min(composer.right + 28, window.innerWidth - width - 12)), top: Math.max(12, Math.min(field.getBoundingClientRect().top - height - 38, window.innerHeight - height - 12)) };
      setPhrasePosition(previous => previous.left === next.left && previous.top === next.top ? previous : next);
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
    if (panel) observer?.observe(panel);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { observer?.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [binding, replacementPresentation, suggestions.length, suggestionError, writable]);

  const close = (outcome: "applied" | "dismissed" = "dismissed"): void => {
    const current = bufferRef.current;
    if (outcome === "dismissed" && writable && current && binding?.draftId === current.record.id && binding.sequence === current.sequence && binding.contextKey === contextKey(current) && binding.sourceText === current.content.instructions) {
      setPhraseOutcomePresentation({ kind: "dismissed", draftId: current.record.id, sequence: current.sequence, contextKey: contextKey(current) });
    }
    if (selectedKey) customByTarget.current.set(selectedKey, custom);
    fetchEpoch.current += 1; setBinding(undefined); setKeyboardPhraseFocus(false); setSuggestionError(undefined); setSuggesting(false); setWholeWords(false);
  };
  const loadSuggestions = async (target: PhraseBinding, direction?: string, whole = false): Promise<void> => {
    const epoch = ++fetchEpoch.current;
    setSuggesting(true); setSuggestionError(undefined);
    try {
      let values: string[];
      const action = bufferRef.current?.content.action ?? "";
      if (whole) values = [await requestImprovedWords(target.text, action.includes("image") && action !== "animate-image")];
      else if (direction) {
        const result = await fetchCustomSuggestions({ highlightedText: target.text, customRequest: direction, fullPrompt: target.sourceText, contextBefore: target.sourceText.slice(0, target.start), contextAfter: target.sourceText.slice(target.end), metadata: { draftId: target.draftId, revision: target.sequence, startIndex: target.start, endIndex: target.end, contextKey: target.contextKey } });
        values = result.map(suggestion => suggestion.text ?? "").filter(value => value.trim().length > 0);
      } else {
        const response = await requestEnhancementSuggestions({ highlightedText: target.text, fullPrompt: target.sourceText, originalUserPrompt: target.sourceText, contextBefore: target.sourceText.slice(0, target.start), contextAfter: target.sourceText.slice(target.end) });
        if (!response.ok) throw new Error("Suggestions are unavailable. Your words are unchanged.");
        const result = ApiSuccessResponseSchema(SuggestionResponseSchema).parse(await response.json()).data;
        values = result.suggestions.map(suggestion => typeof suggestion === "string" ? suggestion : "text" in suggestion ? suggestion.text : suggestion.suggestion);
      }
      const current = bufferRef.current;
      if (epoch !== fetchEpoch.current || !current || current.record.id !== target.draftId || current.sequence !== target.sequence || contextKey(current) !== target.contextKey) return;
      setSuggestions(values);
      if (direction) { setCustom(""); customByTarget.current.delete(canonicalJson(target)); }
    } catch (failure) { if (epoch === fetchEpoch.current) setSuggestionError(failure instanceof Error ? failure.message : "Suggestions could not load."); }
    finally { if (epoch === fetchEpoch.current) setSuggesting(false); }
  };

  const select = (): void => {
    setHoveredPhrase(undefined);
    const current = bufferRef.current;
    const field = textarea.current;
    if (!current || !field || field.selectionStart === field.selectionEnd || !writable || !assisted) return;
    try {
      const target = bindPhrase({ id: current.record.id, sequence: current.sequence, contextKey: contextKey(current), instructions: current.content.instructions, writable }, field.selectionStart, field.selectionEnd);
      const key = canonicalJson(target);
      setReplacementPresentation("alternatives"); setWholeWords(false); setBinding(target); setCustom(customByTarget.current.get(key) ?? ""); setSuggestions([]);
      void loadSuggestions(target);
    } catch { setSuggestionError("Select complete characters in the current words."); }
  };

  const activatePhrase = (span: LabeledSpan): void => {
    const field = textarea.current;
    if (!field || !writable) return;
    field.focus(); field.setSelectionRange(span.start, span.end); setKeyboardPhraseFocus(true); select();
  };

  const improveWords = (): void => {
    if (!assisted) { onAccountRequired?.(); return; }
    const current = bufferRef.current; const field = textarea.current;
    if (!current || !field || !writable || !current.content.instructions.trim()) { field?.focus(); return; }
    const selected = field.selectionStart !== field.selectionEnd;
    try {
      const target = bindPhrase({ id: current.record.id, sequence: current.sequence, contextKey: contextKey(current), instructions: current.content.instructions, writable }, selected ? field.selectionStart : 0, selected ? field.selectionEnd : current.content.instructions.length);
      setReplacementPresentation("words"); setWholeWords(!selected); setBinding(target); setSuggestions([]); setCustom(""); setHoveredPhrase(undefined); void loadSuggestions(target, undefined, !selected);
    } catch { setSuggestionError("Select complete characters in the current words."); }
  };

  const apply = (replacement: string): void => {
    const current = bufferRef.current;
    if (!current || !binding) return;
    const draft = { id: current.record.id, sequence: current.sequence, contextKey: contextKey(current), instructions: current.content.instructions, writable };
    const reviewed = current.sequence === binding.sequence && current.content.instructions === binding.sourceText ? { state: "reviewable" as const, binding } : reviewPhraseChange(draft, binding);
    if (reviewed.state === "rejected") { setSuggestionError("This phrase is missing or ambiguous. Select the phrase again in your current words."); return; }
    const result = applyPhraseChange(draft, reviewed.binding, replacement);
    if (result.state === "rejected") { setSuggestionError("This selected phrase is no longer writable. Select it again."); return; }
    const changed = result.instructions !== current.content.instructions;
    const nextSequence = current.sequence + (changed ? 1 : 0);
    const previousScroll = textarea.current?.scrollTop ?? 0;
    setPhraseOutcomePresentation(changed ? { kind: "applied", draftId: current.record.id, sequence: nextSequence, contextKey: contextKey(current) } : undefined);
    controller.edit({ ...current.content, instructions: result.instructions });
    close("applied"); typingGroup.current = crypto.randomUUID();
    requestAnimationFrame(() => {
      const observed = bufferRef.current; const field = textarea.current;
      if (!observed || !field || observed.record.id !== current.record.id || observed.sequence !== nextSequence || contextKey(observed) !== contextKey(current)) return;
      field.focus({ preventScroll: true });
      // Apply preserves the current viewport; subsequent caret/wheel input
      // still scrolls the real textarea and its semantic paint together.
      field.scrollTop = previousScroll;
      if (painted.current) painted.current.scrollTop = field.scrollTop;
    });
  };

  if (!buffer) return <EmptyComposer controller={controller} />;
  const candidates = controller.profiles.filter(profile => profile.action === buffer.content.action);
  const profile = candidates.find(candidate => candidate.id === buffer.content.settings.profileId);
  const observedInputs = observedDraftInputs(buffer.content.inputs, controller.media);
  const observedContent = { ...buffer.content, inputs: observedInputs };
  const unavailableInput = observedInputs.some(input => input.state !== "resolved" || !controller.media.some(version => version.id === input.versionId && version.metadata.state === "verified"));
  const auto = buffer.content.settings.profileId === "unselected";
  const autoReady = auto && resolveAuto(observedContent, controller.profiles, controller.media) !== undefined;
  const missingInput = profile?.inputs.some(rule => observedInputs.filter(input => input.state === "resolved" && input.role === rule.role).length < rule.minCount) ?? false;
  const invalidSettings = profile ? capabilityProblems(profile, buffer.content).length > 0 : false;
  const failedPendingInput = buffer.content.inputs.some(input => input.state === "pending" && controller.view.requests.some(request => request.id === input.requestId && request.slots.some(slot => slot.id === input.slotId && (slot.outcome === "failed" || slot.outcome === "cancelled" || slot.delivery === "lost"))));
  const waitingForImage = buffer.content.inputs.some(input => input.state === "pending" && input.role === "primary" && !controller.view.requests.some(request => request.id === input.requestId && request.slots.some(slot => slot.id === input.slotId && (slot.outcome === "failed" || slot.outcome === "cancelled" || slot.delivery === "lost" || slot.outcome === "completed" && slot.delivery === "ready" && slot.versionId !== undefined))));
  const matchingBinding = binding?.draftId === buffer.record.id && binding.contextKey === contextKey(buffer);
  const retentionAtRisk = Boolean(controller.localErrors[buffer.record.id] && controller.saveErrors[buffer.record.id] && buffer.checkpointSequence !== buffer.sequence && buffer.acknowledgedSequence !== buffer.sequence);
  const retentionFailure = [controller.localErrors[buffer.record.id], controller.saveErrors[buffer.record.id]].filter(Boolean).join(" ");
  const entry = actionEntry(buffer.content.action);
  const sourceRole = entry.changesSource ? entry.verb?.role : undefined;
  const source = sourceRole ? buffer.content.inputs.find(input => input.role === sourceRole) : undefined;
  // An empty tool offers every subject its place changes (Upscale: a picture or a clip); the input then picks the action.
  const sourceRoles = sourceRole ? placeActions(buffer.content.action).flatMap(action => { const other = actionEntry(action); return other.changesSource && other.verb ? [other.verb.role] : []; }) : [];
  const hasWords = buffer.content.instructions.trim().length > 0;
  const needsWords = words === "required" || words === "script";
  const wordsHelp = words === "required" || words === "optional";
  const asking = buffer.content.action === "ask";
  // The subject of a change stays alone in its row (Rule 3 tools, Edit); everything else lists its typed inputs.
  const inputs = source ? buffer.content.inputs.filter(input => input === source) : buffer.content.inputs;
  const parked = controller.parkedInputs ?? [];
  const offeredRoles = offeredInputRoles(buffer.content, controller.profiles);
  const maskInput = source ? buffer.content.inputs.find(input => input.role === "mask") : undefined;
  const savedOnDevice = offline && buffer.checkpointSequence === buffer.sequence;
  const wordsHint = waitingForImage && source ? "Waiting for the selected image" : controller.conversation?.status === "archived" ? "Your work and history are kept" : savedOnDevice ? "Offline · saved on this device" : buffer.content.instructions.length >= MAX_DRAFT_WORDS ? `Words stop at ${MAX_DRAFT_WORDS.toLocaleString("en-US")} characters` : undefined;
  const submit = async (): Promise<void> => { if (!onSubmit || making) return; setMaking(true); setSubmitError(undefined); try { await onSubmit(); } catch (failure) { setSubmitError(failure instanceof Error ? failure.message : "This request could not start. Your words are retained."); } finally { setMaking(false); } };


  return <div className="vf-composer-region" data-autosize={compactTextHeight !== undefined || undefined} data-phrase-outcome={phraseOutcome} data-phrase-applied={appliedPresentation || undefined} style={compactTextHeight === undefined ? undefined : { "--vf-words-height": `${compactTextHeight}px`, "--vf-natural-words-height": `${naturalTextHeight}px` } as CSSProperties}>
    {hoveredPhrase && !binding ? createPortal(<SemanticTooltip category={hoveredPhrase.category} style={{ left: hoveredPhrase.left, top: hoveredPhrase.top }} />, document.body) : null}
    {labeling.status === "error" ? <HighlightingUnavailable onRetry={() => labeling.refresh()} /> : null}
    {binding && matchingBinding ? createPortal(replacementPresentation === "words" ? <WordsTools phrase={binding.text} choices={suggestions} whole={wholeWords} busy={suggesting} error={suggestionError} style={phrasePosition} disabled={suggesting || !writable} onChoose={apply} onSuggestAlternatives={() => setReplacementPresentation("alternatives")} onClose={() => { close(); textarea.current?.focus(); }} /> : <PhraseReplacements suggestions={suggestions} custom={custom} suggesting={suggesting} {...(suggestionError ? { error: suggestionError, errorMode: suggestionError.includes("phrase") ? "target" : custom.trim() ? "custom" : "alternatives" } : {})} style={phrasePosition} onKeyboardNavigation={() => setKeyboardPhraseFocus(true)} onApply={apply} onCustomChange={value => { setCustom(value); if (selectedKey) customByTarget.current.set(selectedKey, value); }} onSuggest={() => { void loadSuggestions(binding, custom.trim()); }} onRetry={() => { void loadSuggestions(binding, custom.trim() || undefined); }} onClose={() => { close(); textarea.current?.focus(); }} />, document.body) : null}
    <div className="vf-composer" data-action={buffer.content.action} data-words={words} data-has-profile={Boolean(profile) || undefined} style={appliedPresentation && compactTextHeight !== undefined ? { minHeight: profile ? 272 : 232 } : undefined}>
      <div ref={mediaRow} className="vf-composer-media"><FlipScope watch={reshape.output} root={mediaRow} items=":scope > .vf-media-action, :scope > .vf-input-tile" onFlip={reshape.tiles} />{mediaActions}{inputs.map((input, index) => {
        const version = input.state === "resolved" ? controller.media.find(candidate => candidate.id === input.versionId) : input.state === "importing" ? controller.media.find(candidate => candidate.id === importedVersionId(input.importId)) : undefined;
        const state = inputStatus?.(input);
        const failedRequest = input.state === "pending" && controller.view.requests.some(request => request.id === input.requestId && request.slots.some(slot => slot.id === input.slotId && (slot.outcome === "failed" || slot.outcome === "cancelled" || slot.delivery === "lost")));
        const unavailable = state === "unavailable" || (!version && input.state === "resolved") || failedRequest;
        const preview = <CompactInputPreview version={version} maskId={maskInput?.state === "resolved" ? maskInput.versionId : undefined} unavailable={unavailable} uploading={state === "uploading" || input.state === "importing"} access={controller.access} />;
        return <div className="vf-input-tile" key={`${input.role}:${index}`}>{renderInputPicker ? renderInputPicker(input, preview) : <Button variant="ghost" type="button" className="vf-input-trigger" aria-label={`Change ${input === source ? "the media being changed" : input.role.replaceAll("-", " ")}`} disabled={!writable} onClick={() => onChooseInput()}>{preview}</Button>}<FreshIconButton className="vf-input-remove" icon="close" label={`Remove ${input.role === "primary" ? version?.kind === "image" ? "picture" : version?.kind === "audio" ? "audio" : "clip" : input.role.replaceAll("-", " ")}`} disabled={!writable} onClick={() => { controller.edit(withoutDraftInput({ ...buffer.content, inputs: input === source ? buffer.content.inputs.filter(candidate => candidate.role !== "mask") : buffer.content.inputs }, controller.profiles, input)); }} />{input !== source || buffer.content.action === "extend-video" ? <span className="vf-input-caption">{inputLabel?.(input, version) ?? (input.role === "primary" ? "Extending" : input.role.replaceAll("-", " ").replace(/^./, letter => letter.toUpperCase()))}</span> : null}</div>;
      })}{parked.map((input, index) => {
        const version = input.state === "resolved" ? controller.media.find(candidate => candidate.id === input.versionId) : undefined;
        return <div className="vf-input-tile" data-not-used key={`parked:${index}`}><CompactInputPreview version={version} maskId={undefined} unavailable={false} uploading={false} access={controller.access} /><FreshIconButton className="vf-input-remove" icon="close" label="Remove input that is not used" disabled={!writable} onClick={() => controller.discardParkedInput?.(input)} /><span className="vf-input-caption">Not used</span></div>;
      })}{mediaActions === undefined && (!source || !inputs.length) ? <>{offeredRoles.filter(role => sourceRole ? sourceRoles.includes(role) : !(entry.place.kind === "output" && role === "clip")).map(role => { const label = inputTileLabel(role, roleKinds(buffer.content, controller.profiles, role)); return inputControl ? <span key={role} className="vf-media-action">{inputControl(role, label)}<span>{label}</span></span> : <Button key={role} variant="ghost" type="button" className="vf-media-action" disabled={!writable} onClick={() => onChooseInput(role)}><span className="vf-compact-media-icon"><img src="/design-assets/workspace-compact-reference.svg" alt="" /></span><span>{label}</span></Button>; })}{onSketch && !sourceRole && offeredRoles.some(role => roleKinds(buffer.content, controller.profiles, role).includes("image")) ? <Button variant="ghost" type="button" className="vf-media-action" disabled={!writable} onClick={onSketch}><span className="vf-compact-media-icon"><img src="/design-assets/workspace-compact-sketch.svg" alt="" /></span><span>Sketch</span></Button> : null}</> : null}{wordsHelp ? <div className="vf-words-help"><FreshButton tone="quiet" className="vf-words-help-action" aria-label="Improve wording" title="Improve wording" disabled={!writable || !hasWords} onClick={improveWords}><img src="/design-assets/workspace-action-words.svg" alt="" /><span className="vf-words-help-label">Improve wording</span></FreshButton>{onActionChange ? <FreshButton tone="quiet" className="vf-words-help-action" aria-label="Ask a question" title="Ask a question" aria-pressed={asking} disabled={!writable || (!asking && !hasWords)} onClick={() => onActionChange(asking ? lastOutput.current : "ask")}><img src="/design-assets/workspace-action-question.svg" alt="" /><span className="vf-words-help-label">Ask a question</span></FreshButton> : null}</div> : null}</div>
      <div className="vf-composer-writing">{words === "none" ? null : <div className="vf-prompt-editor" data-selection-painted={Boolean(selectionPaint) || undefined} data-scrollable={compactTextHeight === 198 || undefined} data-input-edit={Boolean(source) || undefined} data-words={words} data-words-hint={wordsHint !== undefined || undefined} data-input-unavailable={failedPendingInput || undefined} data-painted={labels.text === buffer.content.instructions && labels.spans.length > 0 || undefined}>
        {selectionPaint ? <div className="vf-selection-paint" aria-hidden="true" data-presentation={selectionPaint.presentation} data-selection-start={selectionPaint.start} data-selection-end={selectionPaint.end} style={selectionPaint.viewport}>{selectionPaint.boxes.map((box, index) => <span key={index} style={box} />)}</div> : null}
        <div ref={painted} className="vf-word-highlights" role={labels.spans.length ? "group" : undefined} aria-label={labels.spans.length ? "Suggested phrases" : undefined}>{labels.text === buffer.content.instructions ? highlightedWords(buffer.content.instructions, labels.spans, { writable, binding, keyboardFocus: keyboardPhraseFocus, onActivate: activatePhrase }) : null}</div>
        <textarea ref={textarea} className="vf-prompt-words" style={appliedPresentation ? { overflowY: "auto" } : undefined} onMouseMove={event => {
          if (binding || labels.text !== buffer.content.instructions) { setHoveredPhrase(undefined); return; }
          const spans = painted.current?.querySelectorAll<HTMLSpanElement>("span[title]");
          let hovered: { category: string; left: number; top: number } | undefined;
          for (const span of spans ?? []) for (const rect of span.getClientRects()) if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) hovered = { category: span.title, left: Math.max(12, Math.min(rect.left, window.innerWidth - 142)), top: Math.max(12, rect.top - 38) };
          setHoveredPhrase(current => current?.category === hovered?.category && current?.left === hovered?.left && current?.top === hovered?.top ? current : hovered);
        }} onMouseLeave={() => setHoveredPhrase(undefined)} aria-label="Current request words" aria-describedby={labels.text === buffer.content.instructions && labels.spans.length ? highlightDescription : undefined} placeholder={entry.placeholder ?? "What would you like to make?"} maxLength={MAX_DRAFT_WORDS} value={buffer.content.instructions} readOnly={!writable} onScroll={event => { if (painted.current) painted.current.scrollTop = event.currentTarget.scrollTop; }} onChange={event => { setPhraseOutcomePresentation(undefined); controller.edit({ ...buffer.content, instructions: event.target.value }, typingGroup.current); }} onMouseUp={() => { setKeyboardPhraseFocus(false); select(); }} onKeyUp={event => { if (event.key === "Shift") { setKeyboardPhraseFocus(true); select(); } }} onBlur={() => { typingGroup.current = crypto.randomUUID(); void controller.flush(); }} onKeyDown={event => { if (event.key === "Escape" && binding) { event.preventDefault(); event.stopPropagation(); close(); return; } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); setPhraseOutcomePresentation(undefined); if (event.shiftKey) controller.redo(); else controller.undo(); } }} />
        {failedPendingInput ? <p className="vf-prompt-input-warning">Choose an available {entry.group === "picture" ? "image" : "clip"}</p> : null}
        {wordsHint ? <p className="vf-prompt-input-warning vf-prompt-input-waiting">{wordsHint}</p> : null}
        {labels.text === buffer.content.instructions && labels.spans.length ? <p className="vf-sr-only" id={highlightDescription}>Phrase categories: {labels.spans.map(span => `${span.quote ?? span.text}: ${span.category}`).join(". ")}. Select any phrase to find alternatives.</p> : null}
      </div>}
      <CapabilitySettings profiles={controller.profiles} content={observedContent} media={controller.media} disabled={!writable} onProfile={controller.chooseProfile} {...(controller.chooseAuto ? { onAuto: controller.chooseAuto } : {})} onChange={next => controller.edit({ ...next, inputs: buffer.content.inputs })} lookupStatus={capabilityLookupStatus}>
      <ComposerSubmit key={buffer.record.id} action={buffer.content.action} label={primaryLabel ?? entry.label} writable={writable} canSubmit={Boolean(onSubmit && writable && capabilityLookupStatus === "ready" && !unavailableInput && !missingInput && !invalidSettings && !submissionBlockedReason && !controller.serviceUnavailable && !retentionAtRisk && (!needsWords || hasWords) && !controller.preparing && !making && (profile ? profile.availability === "qualified" : auto && autoReady))} busy={making || controller.preparing} onSubmit={() => { void submit(); }} {...(onActionChange ? { onActionChange } : {})} />
      </CapabilitySettings>
      {controller.prepared?.state === "blocked" ? <ul className="vf-blocking-reasons">{controller.prepared.reasons.map((reason, index) => <li key={`${reason.code}:${index}`}>{reason.message}</li>)}</ul> : null}
      {submitError ? <p className="vf-setting-warning" role="status">{submitError}</p> : null}
      </div>
    </div>
    {retentionAtRisk ? <><div className="vf-save-at-risk" role="status" aria-describedby={retentionDescription} title={retentionFailure}><img src="/design-assets/prompt-history/save-at-risk.svg" width="14" height="14" alt="" /><p>Not saved · Keep this tab open</p></div><p id={retentionDescription} className="vf-sr-only">{retentionFailure}</p></> : <>
      {savedOnDevice ? <p className="vf-device-only"><img src="/design-assets/workspace-device-only.svg" width="14" height="14" alt="" />Only on this device</p> : null}
      {buffer.checkpointSequence === buffer.sequence && buffer.acknowledgedSequence !== buffer.sequence && controller.saveErrors[buffer.record.id] ? <p className="vf-setting-warning" role="status">Your latest words are kept on this device. Retry saving to reopen them elsewhere.</p> : null}
      {controller.localErrors[buffer.record.id] ? <p className="vf-notice">{controller.localErrors[buffer.record.id]}</p> : null}
      {controller.saveErrors[buffer.record.id] ? <div className="vf-notice"><p>{controller.saveErrors[buffer.record.id]}</p><FreshButton onClick={() => { void controller.flush(); }}>Retry saving</FreshButton></div> : null}
    </>}
  </div>;
}

/** There is no empty-state chooser: a writable conversation without a working draft opens one on Video (Rule 3). */
function EmptyComposer({ controller }: Pick<PromptComposerProps, "controller">): ReactElement {
  const writable = controller.project?.status === "active" && controller.conversation?.status === "active";
  const opened = useRef(false);
  const { loading, newDraft } = controller;
  useEffect(() => {
    if (loading || !writable || opened.current) return;
    opened.current = true;
    void newDraft("make-video");
  }, [loading, newDraft, writable]);
  return <div className="vf-composer vf-composer-empty"><p role="status">{loading || writable ? "Opening your request…" : "Your work and history are kept"}</p></div>;
}
