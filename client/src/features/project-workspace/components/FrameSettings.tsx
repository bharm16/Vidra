import { useState, type ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import { isParameterValueInDomain, type CapabilityProfile, type ParameterPolicy } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { SettingsMenu } from "./SettingsMenu";

interface FrameSettingsProps {
  profile: CapabilityProfile;
  content: DraftContent;
  disabled: boolean;
  onChange(content: DraftContent): void;
  presentation?: "default" | "model";
}

function numericValue(content: DraftContent, name: string, policy: ParameterPolicy): number | undefined {
  const value = policy.policy === "fixed" ? policy.value : content.settings.parameters[name];
  return typeof value === "number" ? value : undefined;
}

function validValue(text: string, policy: ParameterPolicy | undefined): boolean {
  if (!text.trim()) return false;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || !policy) return false;
  if (policy.policy === "fixed") return value === policy.value;
  if (policy.policy !== "editable") return false;
  return isParameterValueInDomain(policy.domain, value);
}

/** G27/G28: derived seconds never replace the exact stored frame count and generation rate. */
export function FrameSettings({ profile, content, disabled, onChange, presentation = "default" }: FrameSettingsProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [frames, setFrames] = useState("");
  const [rate, setRate] = useState("");
  const fields = ["numFrames", "framesPerSecond"].filter(name => {
    const policy = profile.parameters[name];
    return policy?.policy === "fixed" && typeof policy.value === "number" || policy?.policy === "editable" && (policy.domain.kind === "range" || policy.domain.values.every(value => typeof value === "number"));
  });
  if (!fields.length) return null;
  const valid = fields.every(name => validValue(name === "numFrames" ? frames : rate, profile.parameters[name]));
  const apply = (): void => {
    if (!valid) return;
    const parameters = { ...content.settings.parameters };
    for (const name of fields) if (profile.parameters[name]?.policy === "editable") parameters[name] = Number(name === "numFrames" ? frames : rate);
    onChange({ ...content, settings: { ...content.settings, parameters } });
    setOpen(false);
  };
  const seconds = Number(frames) / Number(rate);
  return <SettingsMenu title="Length and motion" open={open} onOpenChange={next => {
    if (next) {
      setFrames(String(numericValue(content, "numFrames", profile.parameters.numFrames ?? { policy: "unknown", reason: "Not available" }) ?? ""));
      setRate(String(numericValue(content, "framesPerSecond", profile.parameters.framesPerSecond ?? { policy: "unknown", reason: "Not available" }) ?? ""));
    }
    setOpen(next);
  }} className={`vf-frame-settings${presentation === "model" ? " vf-frame-settings-model" : ""}`} align={presentation === "model" ? "start" : "end"} alignOffset={presentation === "model" ? -68 : 0} sideOffset={presentation === "model" ? 15 : 6} trigger={<FreshButton className="vf-setting-chip vf-frame-advanced" aria-label="Advanced length and motion" disabled={disabled}><span className="vf-setting-icon" aria-hidden="true"><img src="/design-assets/workspace-setting-advanced.svg" alt="" /></span>Advanced</FreshButton>}>
    <p className="vf-frame-panel-title">Length and motion</p>
    {fields.map(name => {
      const policy = profile.parameters[name];
      const editable = policy?.policy === "editable";
      const value = name === "numFrames" ? frames : rate;
      return <label key={name}><span>{name === "numFrames" ? "Frames" : "Generation frame rate"}</span><input type="number" aria-label={name === "numFrames" ? "Frames" : "Generation frame rate"} value={value} readOnly={!editable} aria-invalid={!validValue(value, policy)} onChange={event => name === "numFrames" ? setFrames(event.target.value) : setRate(event.target.value)} /></label>;
    })}
    <p className="vf-frame-derived vf-muted">{Number.isFinite(seconds) && seconds > 0 ? `About ${seconds.toFixed(1)} seconds` : "Choose a valid frame count and rate"}</p>
    <FreshButton tone="primary" disabled={!valid} onClick={apply}>Apply</FreshButton>
  </SettingsMenu>;
}
