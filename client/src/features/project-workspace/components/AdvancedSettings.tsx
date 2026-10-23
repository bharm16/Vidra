import { useId, useState, type ReactElement } from "react";
import { FreshButton, FreshIcon } from "@/components/fresh/FreshButton";
import type { CapabilityProfile, ParameterPolicy, ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { advancedParameters, parameterPresentation } from "@shared/workflow/actionRegistry";
import { allowedParameterValues, settingLabel, valueLabel, withConstraints } from "../state/capabilitySettings";
import { LANGUAGES } from "../state/languages";
import { SettingsMenu } from "./SettingsMenu";

type Editable = Extract<ParameterPolicy, { policy: "editable" }>;

interface FieldProps {
  profile: CapabilityProfile;
  content: DraftContent;
  name: string;
  policy: Editable;
  disabled: boolean;
  onChange(value: ParameterValue): void;
}

/** A menu field: the value on the bar, its options listed under it; values the model or its constraints cannot use are greyed. */
function MenuField({ profile, content, name, policy, disabled, onChange, values }: FieldProps & { values: ParameterValue[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const list = useId();
  const allowed = policy.domain.kind === "enum" ? allowedParameterValues(profile, content, name) ?? [] : values;
  const value = content.settings.parameters[name] ?? policy.defaultValue;
  const label = settingLabel(profile, name);
  return <div className="vf-advanced-field" data-kind="menu">
    <FreshButton tone="quiet" className="vf-advanced-bar" aria-expanded={open} aria-controls={list} disabled={disabled} onClick={() => setOpen(current => !current)}><span>{label}</span><span className="vf-advanced-value">{valueLabel(profile, name, value)}<FreshIcon name="down" /></span></FreshButton>
    {open ? <div id={list} className="vf-setting-options" role="group" aria-label={label}>{values.map(option => <FreshButton tone="quiet" className="vf-setting-option" key={String(option)} aria-pressed={option === value} disabled={disabled || !allowed.includes(option)} onClick={() => { onChange(option); setOpen(false); }}><span>{valueLabel(profile, name, option)}</span>{option === value ? <FreshIcon name="check" /> : null}</FreshButton>)}</div> : null}
  </div>;
}

function ToggleField({ profile, content, name, policy, disabled, onChange }: FieldProps): ReactElement {
  const on = (content.settings.parameters[name] ?? policy.defaultValue) === true;
  const label = settingLabel(profile, name);
  return <div className="vf-advanced-field" data-kind="toggle"><span>{label}</span><button type="button" className="vf-toggle" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}><span /></button></div>;
}

function SliderField({ profile, content, name, policy, disabled, onChange }: FieldProps): ReactElement | null {
  const value = content.settings.parameters[name] ?? policy.defaultValue;
  const [draft, setDraft] = useState(typeof value === "number" ? value : 0);
  if (policy.domain.kind !== "range") return null;
  const label = settingLabel(profile, name);
  return <label className="vf-advanced-field" data-kind="slider"><span className="vf-advanced-bar-static"><span>{label}</span><span className="vf-advanced-value">{valueLabel(profile, name, draft)}</span></span><input type="range" aria-label={label} min={policy.domain.min} max={policy.domain.max} step={policy.domain.step} value={draft} disabled={disabled} onChange={event => setDraft(Number(event.target.value))} onPointerUp={() => onChange(draft)} onKeyUp={() => onChange(draft)} onBlur={() => { if (draft !== value) onChange(draft); }} /></label>;
}

function TextField({ profile, content, name, policy, disabled, onChange }: FieldProps): ReactElement | null {
  const value = content.settings.parameters[name] ?? policy.defaultValue;
  const [draft, setDraft] = useState(typeof value === "string" ? value : "");
  if (policy.domain.kind !== "text") return null;
  const label = settingLabel(profile, name);
  const placeholder = parameterPresentation(profile, name)?.placeholder;
  return <label className="vf-advanced-field" data-kind="text"><span>{label}</span><textarea className="vf-field" aria-label={label} rows={2} maxLength={policy.domain.maxLength} value={draft} {...(placeholder ? { placeholder } : {})} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onChange(draft); }} /></label>;
}

/** Everything the model offers beyond its core chips, one field bar per setting (Rule 6). */
export function AdvancedSettings({ profile, content, disabled, onChange }: { profile: CapabilityProfile; content: DraftContent; disabled: boolean; onChange(content: DraftContent): void }): ReactElement {
  const [open, setOpen] = useState(false);
  const set = (name: string, value: ParameterValue): void => onChange({ ...content, settings: { ...content.settings, parameters: withConstraints(profile, { ...content.settings.parameters, [name]: value }) } });
  return <SettingsMenu title="Advanced" open={open} onOpenChange={setOpen} className="vf-advanced-menu" trigger={<FreshButton className="vf-setting-chip vf-frame-advanced" aria-label="Advanced" disabled={disabled}><span className="vf-setting-icon" aria-hidden="true"><img src="/design-assets/workspace-setting-advanced.svg" alt="" /></span>Advanced</FreshButton>}>
    <div className="vf-advanced-fields" key={`${profile.id}:${open}`}>{advancedParameters(profile).map(([name, policy]) => {
      const props: FieldProps = { profile, content, name, policy, disabled, onChange: value => set(name, value) };
      if (policy.domain.kind === "enum") return policy.domain.values.every(value => typeof value === "boolean") ? <ToggleField key={name} {...props} /> : <MenuField key={name} {...props} values={policy.domain.values} />;
      if (policy.domain.kind === "range") return <SliderField key={name} {...props} />;
      if (parameterPresentation(profile, name)?.format === "language") return <MenuField key={name} {...props} values={LANGUAGES.map(language => language.code)} />;
      return <TextField key={name} {...props} />;
    })}</div>
  </SettingsMenu>;
}
