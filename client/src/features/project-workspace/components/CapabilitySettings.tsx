import { createContext, useContext, useRef, useState, type ReactElement, type ReactNode } from "react";
import { SettingsMenu } from "./SettingsMenu";
import { FreshButton, FreshIcon } from "@/components/fresh/FreshButton";
import { isParameterValueInRange, type CapabilityProfile, type ParameterRole, type ParameterValue } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { actionEntry, advancedParameters, composerOutput, composerTool, roleParameter } from "@shared/workflow/actionRegistry";
import { autoCandidates, coreChipEntries, countLabel, derivedParameter, evaluateCapabilityDraft, parameterDescription, preModelParameterChoices, roleLabel, settingLabel, settingOptions, valueLabel, withConstraints, type CoreChipEntry, type PreModelParameterChoices, type SettingOption } from "../state/capabilitySettings";
import { modelChoices } from "../state/inputBinding";
import { LANGUAGES } from "../state/languages";
import { AdvancedSettings } from "./AdvancedSettings";
import { modelLogo } from "./modelLogo";
import { FlipScope } from "@/components/motion/FlipScope";
import { CHIP_VALUE, CHIP_VALUE_SHEET, Swap } from "@/components/motion/Swap";
import { useCompactViewport } from "@/hooks/useCompactViewport";
import { useOutputReshape } from "../hooks/useOutputReshape";
import "./model-creation-fidelity.css";

export type CapabilityLookupStatus = "ready" | "loading" | "error";

const ROLE_ICONS: Partial<Record<ParameterRole | "count", string>> = { shape: "/design-assets/workspace-setting-shape.svg", duration: "/design-assets/workspace-setting-duration.svg", sound: "/design-assets/fidelity-model-sound.svg", voice: "/design-assets/fresh-icon-mic.svg", language: "/design-assets/fresh-icon-languages.svg", scale: "/design-assets/fresh-icon-scaling.svg" };

function ChipIcon({ role, kind }: { role: ParameterRole | "count" | "model"; kind?: CapabilityProfile["output"]["kind"] }): ReactElement {
  const source = role === "model" ? "/design-assets/workspace-setting-model.svg" : role === "count" ? kind === "image" ? "/design-assets/fresh-icon-image.svg" : kind === "audio" ? "/design-assets/fresh-icon-audio-lines.svg" : "/design-assets/fresh-icon-film.svg" : ROLE_ICONS[role] ?? "/design-assets/workspace-setting-settings.svg";
  return <span className="vf-setting-icon" aria-hidden="true"><img src={source} alt="" /></span>;
}

/** True while the chips reshape for another output, which cross-fades whole chips instead. */
const OutputSwitching = createContext(false);

/** A chip's value crossfades in place as its menu folds back into it (frames 2687, 2702). */
function ChipValue({ value }: { value: string }): ReactElement {
  const compact = useCompactViewport();
  const switching = useContext(OutputSwitching);
  return <Swap swapKey={value} still={switching} motion={compact ? CHIP_VALUE_SHEET : CHIP_VALUE}>{value}</Swap>;
}

interface MenuChipProps {
  label: string;
  icon: ReactElement;
  value: string;
  options: SettingOption[];
  selected: ParameterValue | undefined;
  display(value: ParameterValue): string;
  describe?(value: ParameterValue): string | undefined;
  searchable?: boolean;
  disabled: boolean;
  onChange(value: ParameterValue): void;
  ranges?: PreModelParameterChoices["ranges"];
  className?: string;
}

/** One core chip and its menu. Every value other models offer stays listed; unusable ones are greyed with no reason. */
function MenuChip({ label, icon, value, options, selected, display, describe, searchable = false, disabled, onChange, ranges = [], className = "" }: MenuChipProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = searchable && query ? options.filter(option => display(option.value).toLocaleLowerCase().includes(query.toLocaleLowerCase())) : options;
  const choose = (next: ParameterValue): void => { onChange(next); setOpen(false); setQuery(""); };
  return <SettingsMenu title={label} open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }} className={className} trigger={<FreshButton className="vf-setting-chip" disabled={disabled} aria-label={`${label}: ${value}`}>{icon}<ChipValue value={value} /><FreshIcon name="down" /></FreshButton>}>
    {searchable ? <label className="vf-model-search"><img src="/design-assets/fidelity-model-search.svg" alt="" /><input type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)} /></label> : null}
    <div className="vf-setting-options" role="group" aria-label={label}>{shown.map(({ value: option, enabled }, index) => {
      const description = describe?.(option);
      return <FreshButton tone="quiet" className="vf-setting-option" key={`${index}:${String(option)}`} {...(description ? { "aria-label": `${display(option)} ${description}` } : {})} aria-pressed={selected === option} disabled={disabled || !enabled} onClick={() => { if (enabled && !disabled) choose(option); }}><span className="vf-model-setting-copy"><span>{display(option)}</span>{description ? <small>{description}</small> : null}</span>{selected === option ? <FreshIcon name="check" /> : null}</FreshButton>;
    })}</div>
    {ranges.map(range => <RangeField key={`${range.min}:${range.max}:${range.step}`} label={label} range={range} value={typeof selected === "number" && isParameterValueInRange(range, selected) ? selected : undefined} display={display} onChoose={choose} />)}
  </SettingsMenu>;
}

function RangeField({ label, range, value, display, onChoose }: { label: string; range: PreModelParameterChoices["ranges"][number]; value: number | undefined; display(value: ParameterValue): string; onChoose(value: number): void }): ReactElement {
  const [draft, setDraft] = useState(value ?? range.min);
  return <label className="vf-range-setting"><span>{display(draft)}</span><input aria-label={label} type="range" min={range.min} max={range.max} step={range.step} value={draft} onChange={event => setDraft(Number(event.target.value))} onPointerUp={() => onChoose(draft)} onKeyUp={() => onChoose(draft)} /><span>{display(range.min)}–{display(range.max)}</span></label>;
}

/** A core setting this model cannot use keeps its place, greyed, and does not open. */
function UnavailableChip({ label, icon }: { label: string; icon: ReactElement }): ReactElement {
  return <FreshButton className="vf-setting-chip" disabled aria-label={label}>{icon}{label}</FreshButton>;
}

function ReadonlyChip({ label, value, icon }: { label: string; value: string; icon: ReactElement }): ReactElement {
  return <span className="vf-setting-chip vf-setting-readonly" aria-label={`${label}: ${value}`}>{icon}{value}</span>;
}

export interface CapabilitySettingsProps {
  profiles: CapabilityProfile[];
  content: DraftContent;
  media: MediaVersion[];
  disabled: boolean;
  onProfile(profile: CapabilityProfile): void;
  onAuto?(): void;
  onChange(content: DraftContent): void;
  lookupStatus?: CapabilityLookupStatus;
  children?: ReactNode;
}

/** Rule 5 and Rule 6: the model chip, then the action's fixed core chips, then Advanced last when the model has extras. */
export function CapabilitySettings({ profiles, content, media, disabled, onProfile, onAuto, onChange, lookupStatus = "ready", children }: CapabilitySettingsProps): ReactElement {
  const [modelOpen, setModelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { candidates, profile, problems, modelNotice, unsupportedSaved, fixedConflicts } = evaluateCapabilityDraft(profiles, content, media);
  const auto = content.settings.profileId === "unselected";
  const entry = actionEntry(content.action);
  const shownModels = modelChoices(content, profiles).filter(choice => choice.profile.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const row = useRef<HTMLDivElement>(null);
  const reshape = useOutputReshape(composerOutput(content.action) ?? composerTool(content.action));
  const setParameter = (name: string, value: ParameterValue): void => onChange({ ...content, settings: { ...content.settings, parameters: profile ? withConstraints(profile, { ...content.settings.parameters, [name]: value }) : { ...content.settings.parameters, [name]: value } } });
  const kind = profile?.output.kind ?? candidates[0]?.output.kind;
  const maxCount = profile ? profile.output.maxCount : Math.max(1, ...autoCandidates(profiles, content, media).map(candidate => candidate.output.maxCount));
  const modelLabel = auto ? "Auto" : profile?.label ?? "Choose model";
  const logo = profile ? modelLogo(profile) : undefined;
  /** A text setting reads as typed, except Language, which picks from the model's languages. */
  const textChip = (item: CoreChipEntry, owner: CapabilityProfile, name: string, maxLength: number): ReactElement => {
    const icon = <ChipIcon role={item.chip} />;
    const label = settingLabel(owner, name);
    const value = content.settings.parameters[name];
    const display = (option: ParameterValue): string => valueLabel(owner, name, option);
    const languages = item.chip === "language" ? [...Object.keys(owner.presentation?.parameters[name]?.values ?? {}), ...LANGUAGES.map(language => language.code)] : [];
    if (!languages.length) return <ReadonlyChip key={name} label={label} value={typeof value === "string" && value ? value : label} icon={icon} />;
    return <MenuChip key={name} label={label} icon={icon} value={value === undefined ? label : display(value)} options={[...new Set(languages)].map(option => ({ value: option, enabled: option.length <= maxLength }))} selected={value} display={display} searchable disabled={disabled} onChange={next => setParameter(name, next)} />;
  };
  const chip = (item: CoreChipEntry): ReactElement => {
    const icon = <ChipIcon role={item.chip} />;
    const label = item.name ? settingLabel(profile, item.name) : roleLabel(item.chip);
    if (item.chip === "sound") {
      const generated = profile?.generatedAudio ?? (candidates.every(candidate => candidate.generatedAudio === "always") ? "always" : undefined);
      if (generated === "always") return <ReadonlyChip key="sound" label="Sound" value="Sound included" icon={icon} />;
      if (!item.name || item.policy?.policy !== "editable" || profile?.generatedAudio === "unsupported") return <UnavailableChip key="sound" label="Sound" icon={icon} />;
      const on = content.settings.parameters[item.name] === true;
      return <FreshButton key="sound" className="vf-setting-chip" aria-label={`Sound: ${on ? "on" : "off"}`} aria-pressed={on} disabled={disabled} onClick={() => setParameter(item.name ?? "", !on)}>{icon}{on ? "Sound" : "Sound off"}</FreshButton>;
    }
    if (auto) {
      const choices = preModelParameterChoices(profiles, content, media, item.chip);
      const name = choices.name;
      if (!name || (!choices.values.length && !choices.ranges.length)) {
        // A text setting (Captions' Language) is chosen the way its first candidate takes it.
        const typed = autoCandidates(profiles, content, media).map(candidate => ({ candidate, found: roleParameter(candidate, item.chip) })).find(({ found }) => found?.[1].policy === "editable" && found[1].domain.kind === "text");
        if (typed?.found && typed.found[1].policy === "editable" && typed.found[1].domain.kind === "text") return textChip(item, typed.candidate, typed.found[0], typed.found[1].domain.maxLength);
        // A value every candidate fixes (Lyria's 30s) reads as a fact, not an unusable chip.
        const fixed = autoCandidates(profiles, content, media).map(candidate => ({ candidate, found: roleParameter(candidate, item.chip) }));
        const values = fixed.flatMap(({ found }) => found?.[1].policy === "fixed" ? [found[1].value] : []);
        const first = fixed.find(({ found }) => found?.[1].policy === "fixed");
        if (first?.found && values.length === fixed.length && values.every(value => value === values[0])) return <ReadonlyChip key={item.chip} label={roleLabel(item.chip)} value={valueLabel(first.candidate, first.found[0], values[0] ?? "")} icon={icon} />;
        return <UnavailableChip key={item.chip} label={roleLabel(item.chip)} icon={icon} />;
      }
      const named = autoCandidates(profiles, content, media).find(candidate => candidate.parameters[name]?.policy === "editable");
      // Until a value is chosen, Auto reads its first candidate's default, which is what Make would use.
      const starting = named?.parameters[name];
      const value = content.settings.parameters[name] ?? (starting?.policy === "editable" ? starting.defaultValue : undefined);
      const display = (option: ParameterValue): string => valueLabel(named, name, option);
      return <MenuChip key={item.chip} label={roleLabel(item.chip)} icon={icon} value={value === undefined ? roleLabel(item.chip) : display(value)} options={choices.values.map(option => ({ value: option, enabled: true }))} ranges={choices.ranges} selected={value} display={display} describe={option => parameterDescription(undefined, name, option, item.chip)} searchable={choices.values.length > 8} disabled={disabled} onChange={next => setParameter(name, next)} />;
    }
    if (!profile) {
      // A restored model that is no longer offered keeps its saved values readable, never rewritten.
      const named = candidates.map(candidate => roleParameter(candidate, item.chip)?.[0]).find(name => name !== undefined && content.settings.parameters[name] !== undefined);
      const saved = named ? content.settings.parameters[named] : undefined;
      return named && saved !== undefined ? <ReadonlyChip key={item.chip} label={roleLabel(item.chip)} value={valueLabel(candidates.find(candidate => candidate.parameters[named]), named, saved)} icon={icon} /> : <UnavailableChip key={item.chip} label={roleLabel(item.chip)} icon={icon} />;
    }
    const policy = item.policy;
    if (!item.name || !policy || policy.policy === "unsupported" || policy.policy === "unknown") return <UnavailableChip key={item.chip} label={label} icon={icon} />;
    const name = item.name;
    const display = (option: ParameterValue): string => valueLabel(profile, name, option);
    if (policy.policy === "editable") {
      const value = content.settings.parameters[name];
      if (policy.domain.kind === "text") return textChip(item, profile, name, policy.domain.maxLength);
      const options = policy.domain.kind === "enum" ? settingOptions(profile, candidates, content, name) ?? [] : [];
      return <MenuChip key={name} label={label} icon={icon} value={value === undefined ? label : display(value)} options={options} ranges={policy.domain.kind === "range" ? [policy.domain] : []} selected={value} display={display} describe={option => parameterDescription(profile, name, option)} searchable={options.length > 8} disabled={disabled} onChange={next => setParameter(name, next)} />;
    }
    const shown = policy.policy === "fixed" ? policy.value === "match_input_image" ? derivedParameter({ policy: "derived", from: "input-aspect" }, content, media) : display(policy.value) : derivedParameter(policy, content, media);
    return <ReadonlyChip key={name} label={label} value={shown} icon={icon} />;
  };
  return <OutputSwitching.Provider value={reshape.switching}><div ref={row} className="vf-settings" aria-label="Request settings">
    {entry.coreChips.includes("model") ? <SettingsMenu title="Model" open={modelOpen} onOpenChange={open => { setModelOpen(open); if (!open) setQuery(""); }} className="vf-model-menu" trigger={<FreshButton className="vf-setting-chip" data-unavailable={profile && profile.availability !== "qualified" || undefined} disabled={disabled} aria-label={`Model: ${modelLabel}`}>{logo ? <span className="vf-setting-icon vf-model-logo" aria-hidden="true" style={{ maskImage: `url("${logo}")` }} /> : <ChipIcon role="model" />}<ChipValue value={modelLabel} /><FreshIcon name="down" /></FreshButton>}>
      <label className="vf-model-search"><img src="/design-assets/fidelity-model-search.svg" alt="" /><input type="search" aria-label="Search models" placeholder="Search models" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key !== "ArrowDown") return; const first = event.currentTarget.closest(".vf-model-menu")?.querySelector<HTMLButtonElement>(".vf-model-option:not(:disabled)"); if (!first) return; event.preventDefault(); first.focus(); }} /></label>
      {onAuto && !query ? <FreshButton tone="quiet" className="vf-setting-option vf-model-option" aria-pressed={auto} onClick={() => { onAuto(); setModelOpen(false); }}><span className="vf-model-kind vf-model-logo" aria-hidden="true" style={{ maskImage: 'url("/design-assets/workspace-setting-model.svg")' }} /><span className="vf-model-copy">Auto</span>{auto ? <FreshIcon name="check" /> : null}</FreshButton> : null}
      {shownModels.map(({ profile: candidate, selected, takesInputs }) => <FreshButton tone="quiet" className="vf-setting-option vf-model-option" key={candidate.id} aria-pressed={selected} disabled={!takesInputs || candidate.availability !== "qualified"} onClick={() => { onProfile(candidate); setModelOpen(false); setQuery(""); }}><span className="vf-model-kind vf-model-logo" aria-hidden="true" style={{ maskImage: `url("${modelLogo(candidate) ?? "/design-assets/workspace-setting-model.svg"}")` }} /><span className="vf-model-copy">{candidate.label}</span>{selected ? <FreshIcon name="check" /> : null}</FreshButton>)}
      {!shownModels.length ? <p className="vf-setting-warning">{query ? "No matching models" : "No model is available for this action."}</p> : null}
    </SettingsMenu> : null}
    {lookupStatus === "loading" ? <span className="vf-setting-chip vf-setting-readonly vf-model-loading" role="status"><img src="/design-assets/fidelity-model-loading.svg" alt="" />Checking settings…</span> : <>
      {coreChipEntries(content.action, profile ?? (auto ? autoCandidates(profiles, content, media)[0] : undefined)).map(chip)}
      {entry.coreChips.includes("count") ? maxCount > 1 ? <MenuChip label={settingLabel(undefined, "outputCount")} icon={<ChipIcon role="count" {...(kind ? { kind } : {})} />} value={countLabel(content.action, content.settings.outputCount)} options={Array.from({ length: maxCount }, (_, index) => ({ value: index + 1, enabled: true }))} selected={content.settings.outputCount} display={value => countLabel(content.action, Number(value))} disabled={disabled} className="vf-count-setting-menu" onChange={value => { if (typeof value === "number") onChange({ ...content, settings: { ...content.settings, outputCount: value } }); }} /> : <UnavailableChip label={countLabel(content.action, 1)} icon={<ChipIcon role="count" {...(kind ? { kind } : {})} />} /> : null}
      {profile && advancedParameters(profile).length ? <AdvancedSettings profile={profile} content={content} disabled={disabled} onChange={onChange} /> : null}
    </>}
    <FlipScope watch={reshape.output} root={row} items=":scope > .vf-setting-chip" capture={reshape.capture} onFlip={reshape.chips} />
    {children}
  </div>
    {modelNotice && modelNotice.tone !== "hint" ? <p className="vf-setting-warning" role="status">{modelNotice.message}</p> : null}
    {unsupportedSaved.map(name => <div className="vf-setting-warning" key={name}><p>{settingLabel(profile, name)} from your previous setup does not apply to this model.</p><FreshButton tone="quiet" disabled={disabled} onClick={() => { const parameters = { ...content.settings.parameters }; delete parameters[name]; onChange({ ...content, settings: { ...content.settings, parameters } }); }}>Remove {settingLabel(profile, name).toLowerCase()}</FreshButton></div>)}
    {problems.length && !modelNotice ? <ul className="vf-blocking-reasons">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul> : null}
    {fixedConflicts.map(([name, policy]) => <FreshButton key={name} tone="quiet" disabled={disabled} onClick={() => onChange({ ...content, settings: { ...content.settings, parameters: { ...content.settings.parameters, [name]: policy.value } } })}>Use {settingLabel(profile, name).toLowerCase()} {valueLabel(profile, name, policy.value)}</FreshButton>)}
  </OutputSwitching.Provider>;
}

