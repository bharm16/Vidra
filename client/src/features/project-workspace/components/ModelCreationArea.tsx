import type { ReactElement, ReactNode } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent, DraftInput } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { modelCreationFeedback, modelInputLabel, type ModelCreationNotice } from "../state/capabilitySettings";
import "./model-creation-fidelity.css";

export type CapabilityLookupStatus = "ready" | "loading" | "error";
export interface ModelCreationFeedback extends ModelCreationNotice {
  actionLabel?: string;
  onAction?(): void;
}
export interface ModelCreationAreaProps {
  profile: CapabilityProfile | undefined;
  modelLabel?: string;
  content: DraftContent;
  media: MediaVersion[];
  lookupStatus?: CapabilityLookupStatus;
  onRetry?(): void;
  onUseFrame?(): void;
  composer: ReactNode;
  feedback?: ModelCreationFeedback;
}

/** Page 07's model presentation; the supplied composer retains the real draft and dispatch authority. */
export function ModelCreationArea({ profile, modelLabel, content, media, lookupStatus = "ready", onRetry, onUseFrame, composer, feedback }: ModelCreationAreaProps): ReactElement {
  const label = profile?.label ?? modelLabel;
  const notice: ModelCreationFeedback | undefined = lookupStatus === "error"
    ? { tone: "danger", message: "Settings could not load", actionLabel: "Try again", ...(onRetry ? { onAction: onRetry } : {}) }
    : lookupStatus === "loading" ? undefined : feedback ?? (profile ? modelCreationFeedback(profile, content, media) : undefined);
  const actionLabel = notice?.actionLabel ?? (notice?.kind === "extension-ineligible" && onUseFrame ? "Use a frame instead" : undefined);
  const onAction = notice?.onAction ?? (notice?.kind === "extension-ineligible" ? onUseFrame : undefined);
  return <main className="vf-model-creation" aria-label="Model creation" data-has-inputs={content.inputs.length > 0 || undefined} data-lookup={lookupStatus}>
    <div className="vf-model-creation-area">
      {label ? <header className="vf-model-creation-heading"><span className="vf-model-video-badge"><img src="/design-assets/fidelity-model-video.svg" alt="" /></span><h1>{label}</h1></header> : null}
      {composer}
      {notice ? <div className={`vf-model-feedback${notice.tone === "hint" ? " vf-model-hint" : " vf-model-notice"}`} data-tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
        <img src={`/design-assets/fidelity-model-${notice.tone === "hint" ? "info" : notice.tone === "danger" ? "error" : "warning"}.svg`} alt="" />
        <span>{notice.message}</span>
        {actionLabel ? <FreshButton disabled={!onAction} onClick={onAction}>{actionLabel}</FreshButton> : null}
      </div> : null}
    </div>
  </main>;
}

export interface ModelInputActionsProps {
  profile: CapabilityProfile | undefined;
  lookupStatus?: CapabilityLookupStatus;
  disabled: boolean;
  inputs?: DraftInput[];
  onChooseInput(role: DraftInput["role"]): void;
  onSketch?(): void;
}

/** Input actions come only from the selected profile, never from the model's display name. */
export function ModelInputActions({ profile, lookupStatus = "ready", disabled, inputs = [], onChooseInput, onSketch }: ModelInputActionsProps): ReactElement {
  const rules = lookupStatus === "ready" ? profile?.inputs.filter(rule => rule.kinds.includes("image") && rule.role !== "mask").sort((a, b) => ["start-frame", "end-frame", "reference", "primary"].indexOf(a.role) - ["start-frame", "end-frame", "reference", "primary"].indexOf(b.role)) ?? [] : [];
  const labels: Partial<Record<DraftInput["role"], string>> = { "start-frame": "Start frame", "end-frame": "End frame", reference: "References", primary: profile?.output.kind === "video" ? "Start frame" : "Picture" };
  const missing = inputs.length ? rules.filter(rule => rule.minCount > inputs.filter(input => input.role === rule.role).length) : [];
  return <><div className="vf-model-media-actions">
    {rules.map(rule => {
      const optionalPlaceholder = rule.role === "end-frame" && rule.minCount === 0 && !inputs.some(input => input.role === "start-frame" || input.role === "primary");
      return <FreshButton key={rule.role} tone="quiet" className="vf-model-input-action" data-optional={optionalPlaceholder || undefined} disabled={disabled} onClick={() => onChooseInput(rule.role)}><span className="vf-model-action-icon"><img src={optionalPlaceholder ? "/design-assets/fidelity-model-input.svg" : "/design-assets/fidelity-model-input-normal.svg"} alt="" /></span><span>{labels[rule.role] ?? rule.role}</span></FreshButton>;
    })}
    {onSketch ? <FreshButton tone="quiet" className="vf-model-input-action" disabled={disabled} onClick={onSketch}><span className="vf-model-action-icon"><img src="/design-assets/fidelity-model-sketch.svg" alt="" /></span><span>Sketch</span></FreshButton> : null}
  </div>{missing.map(rule => <FreshButton key={rule.role} tone="quiet" className="vf-model-input-action vf-model-missing-input" disabled={disabled} aria-label={`Add ${modelInputLabel(rule.role, profile).toLowerCase()}`} onClick={() => onChooseInput(rule.role)}><span className="vf-model-action-icon"><img src="/design-assets/fidelity-model-plus.svg" alt="" /></span><span>{modelInputLabel(rule.role, profile)}</span></FreshButton>)}</>;
}
