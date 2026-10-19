import type { CSSProperties, ReactElement } from "react";
import "@/components/fresh/fresh.css";
import "./prompt-feedback-fidelity.css";

export interface SemanticTooltipProps {
  category: string;
  style?: CSSProperties | undefined;
  id?: string | undefined;
}

/** Meaning of the exact phrase under the pointer or keyboard focus. */
export function SemanticTooltip({ category, style, id }: SemanticTooltipProps): ReactElement {
  return <div id={id} className="vf vf-semantic-tooltip" role="tooltip" style={style}><p>{category}</p></div>;
}
