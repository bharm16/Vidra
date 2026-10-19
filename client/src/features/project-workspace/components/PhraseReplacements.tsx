import { useEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import "./phrase-fidelity.css";

export interface PhraseReplacementsProps {
  suggestions: string[];
  custom: string;
  suggesting: boolean;
  error?: string | undefined;
  errorMode?: "alternatives" | "custom" | "target";
  style?: CSSProperties | undefined;
  onApply(replacement: string): void;
  onCustomChange(value: string): void;
  onSuggest(): void;
  onRetry(): void;
  onClose(): void;
  onKeyboardNavigation?(): void;
}

/** Canonical phrase menu; the composer supplies the selected phrase's anchored position. */
export function PhraseReplacements({ suggestions, custom, suggesting, error, errorMode = custom.trim() ? "custom" : "alternatives", style, onApply, onCustomChange, onSuggest, onRetry, onClose, onKeyboardNavigation }: PhraseReplacementsProps): ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const outside = (event: PointerEvent): void => { if (event.target instanceof Node && !panel.current?.contains(event.target)) close.current(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const initialLoading = suggesting && !suggestions.length;
  const customFailure = error && errorMode === "custom";
  const status = errorMode === "target" ? error : customFailure ? "Couldn’t load new options." : "Couldn’t load alternatives.";
  return <div ref={panel} className="vf vf-phrase-replacements" style={style} role="region" aria-label="Phrase replacements" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className="vf-phrase-replacement-options">{suggestions.map((suggestion, index) => <FreshButton className="vf-phrase-option" tone="quiet" key={`${index}:${suggestion}`} onClick={() => onApply(suggestion)} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        onKeyboardNavigation?.();
        const options = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? suggestions.length - 1 : event.key === "ArrowDown" ? Math.min(index + 1, suggestions.length - 1) : Math.max(0, index - 1);
        const next = options?.[nextIndex]; next?.focus(); next?.scrollIntoView({ block: "nearest" });
      }
    }}>{suggestion}</FreshButton>)}</div>
    {initialLoading ? <p className="vf-phrase-status" role="status">Finding alternatives…</p> : null}
    {!suggesting && !error && !suggestions.length ? <p className="vf-phrase-status" role="status">No alternatives found.</p> : null}
    {error && !customFailure ? <><p className="vf-phrase-status" role="status" title={error}>{status}</p><FreshButton className="vf-phrase-option" tone="quiet" onClick={onRetry}>Try again</FreshButton></> : null}
    {!initialLoading ? <form className="vf-phrase-custom-request" onSubmit={event => { event.preventDefault(); if (custom.trim() && !suggesting) onSuggest(); }}><input aria-label="Describe another direction" value={custom} maxLength={500} placeholder="Describe another direction…" onChange={event => onCustomChange(event.target.value)} onKeyDown={event => { if (event.key !== "Escape") event.stopPropagation(); }} /><span aria-hidden="true" /><FreshButton className="vf-phrase-suggest" tone="quiet" data-pending={suggesting || undefined} disabled={!custom.trim() || suggesting} type="submit">{suggesting ? "Suggesting…" : "Suggest"}</FreshButton></form> : null}
    {custom.length >= 500 ? <p className="vf-phrase-status">{custom.length} / 500</p> : null}
    {customFailure ? <><p className="vf-phrase-status" role="status" title={error}>{status}</p><FreshButton className="vf-phrase-option" tone="quiet" onClick={onRetry}>Try again</FreshButton></> : null}
  </div>;
}
