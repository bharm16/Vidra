import { useEffect, useRef, type CSSProperties, type ReactElement } from "react";
import { FreshButton } from "@/components/fresh/FreshButton";
import "./words-tools-fidelity.css";

export interface WordsToolsProps {
  phrase: string;
  choices: readonly string[];
  style?: CSSProperties | undefined;
  disabled?: boolean;
  onChoose(value: string): void;
  onSuggestAlternatives(): void;
  onClose(): void;
}

/** The selected words stay bound by the composer; these choices only request a deliberate replacement. */
export function WordsTools({ phrase, choices, style, disabled = false, onChoose, onSuggestAlternatives, onClose }: WordsToolsProps): ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const outside = (event: PointerEvent): void => { if (event.target instanceof Node && !panel.current?.contains(event.target)) close.current(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <div ref={panel} className="vf vf-words-tools" role="region" aria-label="Words tools" style={style} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <p className="vf-words-tools-phrase">“{phrase}”</p>
    <p className="vf-words-tools-label">Try a different direction</p>
    <div className="vf-words-tools-choices">{choices.slice(0, 2).map((choice, index) => <FreshButton className="vf-words-tools-choice" key={`${index}:${choice}`} disabled={disabled} onClick={() => onChoose(choice)}>{choice}</FreshButton>)}</div>
    <FreshButton className="vf-words-tools-alternatives" tone="quiet" disabled={disabled} onClick={onSuggestAlternatives}>Suggest alternatives</FreshButton>
  </div>;
}
