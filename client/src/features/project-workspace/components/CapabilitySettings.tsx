import { useState, type ReactElement, type ReactNode } from "react";
import { SettingsMenu } from "./SettingsMenu";
import { FreshButton, FreshIcon } from "@/components/fresh/FreshButton";
import { isParameterValueInRange, type CapabilityProfile, type ParameterPolicy, type ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { allowedParameterValues, derivedParameter, evaluateCapabilityDraft, modelCapabilityDescription, parameterDescription, preModelParameterChoices, visibleSavedParameters, parameterLabel, parameterName, settingEntries, settingOptions, settingRole, withConstraints, type PreModelParameterChoices, type SettingOption } from "../state/capabilitySettings";
import { modelChoices } from "../state/inputBinding";
import { FrameSettings } from "./FrameSettings";
import type { CapabilityLookupStatus } from "./ModelCreationArea";
import "./model-creation-fidelity.css";

type Presentation = "default" | "model";
interface SettingProps {
  name: string;
  value: ParameterValue | undefined;
  policy: Extract<ParameterPolicy, { policy: "editable" }>;
  profile?: CapabilityProfile;
  options?: SettingOption[];
  presentation: Presentation;
  disabled: boolean;
  onChange(value: ParameterValue): void;
}

function Setting({ name, value, policy, profile, options, presentation, disabled, onChange }: SettingProps): ReactElement {
  const [open, setOpen] = useState(false);
  const label = parameterName(name, profile?.output.kind);
  const displayValue = (option: ParameterValue): string => parameterLabel(name, option, profile?.output.kind);
  if (presentation === "model" && /audio|sound/i.test(name) && policy.domain.kind === "enum" && policy.domain.values.every(option => typeof option === "boolean") && typeof value === "boolean") {
    return <FreshButton className="vf-setting-chip" aria-label={`Sound: ${value ? "on" : "off"}`} aria-pressed={value} disabled={disabled} onClick={() => onChange(!value)}><SettingIcon name={name} />{value ? "Sound" : "Sound off"}</FreshButton>;
  }
  const values = options ?? (policy.domain.kind === "enum" ? policy.domain.values.map(value => ({ value, enabled: true })) : []);
  return <SettingsMenu title={label} open={open} onOpenChange={setOpen} className={presentation === "model" ? "vf-model-setting-menu" : name === "outputCount" ? "vf-count-setting-menu" : ""} trigger={<FreshButton className={`vf-setting-chip${name === "outputCount" ? " vf-output-count" : ""}`} disabled={disabled} aria-label={`${label}: ${value === undefined ? "Choose" : displayValue(value)}`}><SettingIcon name={name} {...(profile ? { outputKind: profile.output.kind } : {})} />{value === undefined ? label : displayValue(value)}<FreshIcon name="down" /></FreshButton>}>
    {policy.domain.kind === "enum" ? <div className="vf-setting-options" role="group" aria-label={label}>{values.map(({ value: option, enabled }, index) => {
      const description = presentation === "model" && profile && (enabled || settingRole(name) === "shape") ? parameterDescription(profile, name, option) : undefined;
      return <FreshButton tone="quiet" className="vf-setting-option" key={`${index}:${String(option)}`} {...(description ? { "aria-label": `${displayValue(option)} ${description}` } : {})} aria-pressed={value === option} disabled={!enabled} onClick={() => { if (!enabled) return; onChange(option); setOpen(false); }}><span className="vf-model-setting-copy"><span>{displayValue(option)}</span>{description ? <small>{description}</small> : null}</span>{value === option ? <FreshIcon name="check" /> : null}</FreshButton>;
    })}</div> : policy.domain.kind === "range" ? <label className="vf-range-setting"><span>{value === undefined ? "Choose a value" : displayValue(value)}</span><input aria-label={label} type="range" min={policy.domain.min} max={policy.domain.max} step={policy.domain.step} value={typeof value === "number" ? value : policy.domain.min} onChange={event => onChange(Number(event.target.value))} /><span>{policy.domain.min}–{policy.domain.max}</span></label> : null}
  </SettingsMenu>;
}

/** A creation choice this model cannot use keeps its place, greyed, and does not open. */
function UnavailableSetting({ name }: { name: string }): ReactElement {
  const label = parameterName(name);
  return <FreshButton className="vf-setting-chip" disabled aria-label={label}><SettingIcon name={name} />{label}</FreshButton>;
}

function PreModelRange({ name, range, disabled, onChoose }: { name: string; range: PreModelParameterChoices["ranges"][number]; disabled: boolean; onChoose(value: number): void }): ReactElement {
  const [text, setText] = useState("");
  const value = Number(text);
  const valid = text.trim().length > 0 && isParameterValueInRange(range, value);
  const label = parameterName(name);
  return <div className="vf-range-setting" role="group" aria-label={`${label} ${range.min}–${range.max}`}><p className="vf-setting-name">{range.min}–{range.max} · step {range.step}</p><input className="vf-field" type="number" aria-label={`Desired ${label.toLowerCase()}`} min={range.min} max={range.max} step={range.step} value={text} onChange={event => setText(event.target.value)} disabled={disabled} /><FreshButton tone="quiet" className="vf-setting-option" disabled={disabled || !valid} onClick={() => { if (valid) onChoose(value); }}>Use {label.toLowerCase()}</FreshButton></div>;
}

function PreModelSetting({ name, value, choices, disabled, onChange, onChooseModel }: { name: string; value: ParameterValue; choices: PreModelParameterChoices; disabled: boolean; onChange(value: ParameterValue): void; onChooseModel(): void }): ReactElement {
  const [open, setOpen] = useState(false);
  const label = parameterName(name);
  const choose = (next: ParameterValue): void => { if (disabled) return; onChange(next); setOpen(false); };
  return <SettingsMenu title={label} open={open} onOpenChange={setOpen} className="vf-model-setting-menu" trigger={<FreshButton className="vf-setting-chip" disabled={disabled} aria-label={`${label}: ${parameterLabel(name, value)}`}><SettingIcon name={name} />{parameterLabel(name, value)}<FreshIcon name="down" /></FreshButton>}>
    <div className="vf-setting-options" role="group" aria-label={`Desired ${label.toLowerCase()}`}>{choices.values.map(option => {
      const description = parameterDescription(undefined, name, option);
      return <FreshButton tone="quiet" className="vf-setting-option" key={`${typeof option}:${String(option)}`} disabled={disabled} aria-label={description ? `${parameterLabel(name, option)} ${description}` : parameterLabel(name, option)} aria-pressed={value === option} onClick={() => choose(option)}><span className="vf-model-setting-copy"><span>{parameterLabel(name, option)}</span>{description ? <small>{description}</small> : null}</span>{value === option ? <FreshIcon name="check" /> : null}</FreshButton>;
    })}{choices.ranges.map(range => <PreModelRange key={`${range.min}:${range.max}:${range.step}`} name={name} range={range} disabled={disabled} onChoose={choose} />)}{!choices.values.length && !choices.ranges.length ? <><p className="vf-setting-warning" role="status">Choose a model to change this setting.</p><FreshButton tone="quiet" className="vf-setting-option" disabled={disabled} onClick={() => { setOpen(false); onChooseModel(); }}>Choose model</FreshButton></> : null}</div>
  </SettingsMenu>;
}

function SettingIcon({ name, outputKind }: { name: string; outputKind?: CapabilityProfile["output"]["kind"] }): ReactElement {
  if (name === "outputCount" && outputKind) return <span className="vf-setting-icon" aria-hidden="true"><img src={outputKind === "image" ? "/design-assets/fidelity-model-image.svg" : outputKind === "video" ? "/design-assets/fidelity-model-video.svg" : "/design-assets/workspace-action-question.svg"} width="18" height="18" alt="" /></span>;
  if (/audio|sound/i.test(name)) return <span className="vf-setting-icon" aria-hidden="true"><img src="/design-assets/fidelity-model-sound.svg" alt="" /></span>;
  const icon = name === "model" ? "model" : /shape|aspect/i.test(name) ? "shape" : /duration/i.test(name) ? "duration" : "settings";
  return <span className="vf-setting-icon" aria-hidden="true"><img alt="" src={`/design-assets/workspace-setting-${icon}.svg`} /></span>;
}

export interface CapabilitySettingsProps {
  profiles: CapabilityProfile[];
  content: DraftContent;
  media: MediaVersion[];
  disabled: boolean;
  onProfile(profile: CapabilityProfile): void;
  onChange(content: DraftContent): void;
  presentation?: Presentation;
  lookupStatus?: CapabilityLookupStatus;
  children?: ReactNode;
}

export function CapabilitySettings({ profiles, content, media, disabled, onProfile, onChange, presentation = "default", lookupStatus = "ready", children }: CapabilitySettingsProps): ReactElement {
  const [modelOpen, setModelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { candidates, profile, problems, modelNotice: rawModelNotice, unsupportedSaved, fixedConflicts } = evaluateCapabilityDraft(profiles, content, media);
  const modelNotice = presentation === "model" ? rawModelNotice : undefined;
  const shownModels = modelChoices(content, profiles).filter(choice => choice.profile.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const ready = lookupStatus === "ready" && modelNotice?.kind !== "extension-ineligible";
  const parameterValue = (name: string, value: ParameterValue): string => presentation === "model" && profile?.action === "extend-video" && /duration/i.test(name) && typeof value === "number" ? `+${value}s` : parameterLabel(name, value);
  return <><div className="vf-settings" aria-label="Request settings">
    <SettingsMenu title="Model" open={modelOpen} onOpenChange={open => { setModelOpen(open); if (!open) setQuery(""); }} className={`vf-model-menu${presentation === "model" ? " vf-model-setting-menu" : ""}`} trigger={<FreshButton className="vf-setting-chip" data-unavailable={profile && profile.availability !== "qualified" || undefined} disabled={disabled} aria-label={`Model: ${profile?.label ?? "Choose a model"}`}><SettingIcon name="model" />{profile?.label ?? "Choose model"}<FreshIcon name="down" /></FreshButton>}>
      <label className="vf-model-search"><img src="/design-assets/fidelity-model-search.svg" alt="" /><input type="search" aria-label="Search models" placeholder="Search models" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {shownModels.map(({ profile: candidate, selected, takesInputs }) => <FreshButton tone="quiet" className="vf-setting-option vf-model-option" key={candidate.id} aria-pressed={selected} disabled={!takesInputs} onClick={() => { onProfile(candidate); setModelOpen(false); setQuery(""); }}><img className="vf-model-kind" src={presentation === "model" && candidate.output.kind === "video" ? `/design-assets/fidelity-model-kind${selected ? "-selected" : ""}.svg` : `/design-assets/workspace-action-${candidate.output.kind === "image" ? "picture" : candidate.output.kind === "video" ? "clip" : "question"}.svg`} alt="" /><span className="vf-model-copy">{candidate.label}{presentation === "model" ? <small>{modelCapabilityDescription(candidate, profiles)}</small> : candidate.availability !== "qualified" ? <small>{candidate.unavailableReason ?? "Currently unavailable"}</small> : null}</span>{selected ? <FreshIcon name="check" /> : null}</FreshButton>)}
      {!shownModels.length ? <p className="vf-setting-warning">{query ? "No matching models" : "No model is available for this action."}</p> : null}
    </SettingsMenu>
    {!ready ? lookupStatus === "loading" ? <span className="vf-setting-chip vf-setting-readonly vf-model-loading" role="status"><img src="/design-assets/fidelity-model-loading.svg" alt="" />Checking settings…</span> : null : profile ? <>
      {settingEntries(profile).map(([name, policy]) => {
        if (!policy || policy.policy === "unsupported" || policy.policy === "unknown" || (settingRole(name) === "sound" && profile.generatedAudio === "unsupported")) return <UnavailableSetting key={name} name={name} />;
        const value = content.settings.parameters[name];
        const allowed = allowedParameterValues(profile, content, name);
        const constrained = presentation === "model" && policy.policy === "editable" && policy.domain.kind === "enum" && policy.domain.values.length > 1 && allowed?.length === 1 && value === allowed[0];
        if (policy.policy === "editable" && !constrained) return <Setting key={name} name={name} value={value} policy={policy} profile={profile} {...(policy.policy === "editable" && policy.domain.kind === "enum" ? { options: settingOptions(profile, candidates, content, name) ?? [] } : {})} presentation={presentation} disabled={disabled} onChange={next => onChange({ ...content, settings: { ...content.settings, parameters: withConstraints(profile, { ...content.settings.parameters, [name]: next }) } })} />;
        const followsInput = policy.policy === "derived" || (policy.policy === "fixed" && policy.value === "match_input_image");
        let display = constrained && value !== undefined ? parameterValue(name, value) : policy.policy === "fixed" ? parameterValue(name, policy.value) : policy.policy === "derived" ? derivedParameter(policy, content, media) : "";
        if (policy.policy === "fixed" && policy.value === "match_input_image") display = derivedParameter({ policy: "derived", from: "input-aspect" }, content, media);
        if (presentation === "model") display = display.replace(/^~/, "≈");
        if (/audio|sound/i.test(name) && profile.generatedAudio === "always") display = "Sound included";
        return <span className="vf-setting-chip vf-setting-readonly" key={name} aria-label={`${parameterName(name)}: ${display}; ${followsInput ? "from input" : "fixed by model"}`} title={followsInput ? "Follows the selected input" : "Fixed by this model or selected settings"}><SettingIcon name={name} />{display}</span>;
      })}
      {profile.output.maxCount > 1 ? <Setting name="outputCount" value={content.settings.outputCount} policy={{ policy: "editable", defaultValue: 1, domain: { kind: "enum", values: Array.from({ length: profile.output.maxCount }, (_, index) => index + 1) } }} profile={profile} presentation={presentation} disabled={disabled} onChange={value => { if (typeof value === "number") onChange({ ...content, settings: { ...content.settings, outputCount: value } }); }} /> : null}
      {presentation === "model" && !Object.keys(profile.parameters).some(name => /audio|sound/i.test(name)) && profile.generatedAudio === "always" && profile.output.kind === "video" ? <span className="vf-setting-chip vf-setting-readonly" aria-label="Sound included by model"><SettingIcon name="sound" />Sound included</span> : null}
      <FrameSettings profile={profile} content={content} disabled={disabled} onChange={onChange} presentation={presentation} />
    </> : null}
    {!profile ? visibleSavedParameters(content.settings.parameters).map(([name, value]) => content.settings.profileId === "unselected" ? <PreModelSetting key={name} name={name} value={value} choices={lookupStatus === "ready" ? preModelParameterChoices(candidates, content, media, name) : { values: [], ranges: [] }} disabled={disabled} onChange={next => onChange({ ...content, settings: { ...content.settings, parameters: { ...content.settings.parameters, [name]: next } } })} onChooseModel={() => setModelOpen(true)} /> : <span className="vf-setting-chip vf-setting-readonly" key={name} aria-label={`${parameterName(name)}: ${parameterLabel(name, value)}; saved, choose a model to change`} title="Choose a model to change this setting"><SettingIcon name={name} />{parameterLabel(name, value)}</span>) : null}
    {profile && profile.availability !== "qualified" && presentation !== "model" ? <p className="vf-inline-unavailable" role="status" title={profile.unavailableReason} aria-label={`${profile.label} is unavailable${profile.unavailableReason ? `. ${profile.unavailableReason}` : ""}`}><img src="/design-assets/fidelity-model-unavailable.svg" width="14" height="14" alt="" /><span>{profile.label} is unavailable</span></p> : null}
    {children}
  </div>
    {unsupportedSaved.map(name => <div className="vf-setting-warning" key={name}><p>{parameterName(name)} from your previous setup does not apply to this model.</p><FreshButton tone="quiet" disabled={disabled} onClick={() => { const parameters = { ...content.settings.parameters }; delete parameters[name]; onChange({ ...content, settings: { ...content.settings, parameters } }); }}>Remove {parameterName(name).toLowerCase()}</FreshButton></div>)}
    {problems.length && !modelNotice ? <ul className="vf-blocking-reasons">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul> : null}
    {fixedConflicts.map(([name, policy]) => <FreshButton key={name} tone="quiet" disabled={disabled} onClick={() => onChange({ ...content, settings: { ...content.settings, parameters: { ...content.settings.parameters, [name]: policy.value } } })}>Use {parameterName(name).toLowerCase()} {parameterLabel(name, policy.value)}</FreshButton>)}
  </>;
}
